package downloader

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/schollz/progressbar/v3"
)

type Downloader struct {
	baseDir string
}

func New(baseDir string) *Downloader {
	return &Downloader{baseDir: baseDir}
}

// DownloadToPath downloads directly to the given path. Used when the caller (e.g. web app) specifies the exact output path.
func (d *Downloader) DownloadToPath(streamURL, outputPath string, debug bool) error {
	return d.downloadFile(streamURL, outputPath, debug)
}

// DownloadMedia downloads to a path built from baseDir. Used for CLI-only modes (find-missing, queue, etc).
func (d *Downloader) DownloadMedia(streamURL, tmdbID, showTitle, year string, isMovie bool, season, episode, episodeTitle string, debug bool) error {
	localPath := d.buildPath(tmdbID, showTitle, year, isMovie, season, episode, episodeTitle)
	return d.downloadFile(streamURL, localPath, debug)
}

func (d *Downloader) BaseDir() string {
	return d.baseDir
}

func (d *Downloader) GetLocalPath(tmdbID, showTitle, year string, isMovie bool, season, episode, episodeTitle string) string {
	return d.buildPath(tmdbID, showTitle, year, isMovie, season, episode, episodeTitle)
}

// buildPath creates a path under baseDir using Plex-style naming. Only used for CLI modes.
func (d *Downloader) buildPath(tmdbID, showTitle, year string, isMovie bool, season, episode, episodeTitle string) string {
	sanitizedTitle := d.sanitizeFilename(showTitle)

	if isMovie {
		filename := fmt.Sprintf("%s (%s) [%s].mkv", sanitizedTitle, year, tmdbID)
		return filepath.Join(d.baseDir, filename)
	}

	seasonNum, _ := strconv.Atoi(season)
	episodeNum, _ := strconv.Atoi(episode)

	sanitizedEpisodeTitle := episodeTitle
	if sanitizedEpisodeTitle == "" {
		sanitizedEpisodeTitle = fmt.Sprintf("Episode %s", episode)
	}
	sanitizedEpisodeTitle = d.sanitizeFilename(sanitizedEpisodeTitle)

	showDir := fmt.Sprintf("%s [%s]", sanitizedTitle, tmdbID)
	seasonDir := fmt.Sprintf("Season %d", seasonNum)
	filename := fmt.Sprintf("%s - S%02dE%02d - %s [%s].mkv",
		sanitizedTitle, seasonNum, episodeNum, sanitizedEpisodeTitle, tmdbID)

	return filepath.Join(d.baseDir, showDir, seasonDir, filename)
}

func (d *Downloader) sanitizeFilename(name string) string {
	reg := regexp.MustCompile(`[<>:"/\\|?*]`)
	sanitized := reg.ReplaceAllString(name, "-")

	spaceReg := regexp.MustCompile(`\s+`)
	sanitized = spaceReg.ReplaceAllString(sanitized, " ")

	return strings.TrimSpace(sanitized)
}

func (d *Downloader) downloadFile(url, localPath string, debug bool) error {
	if err := os.MkdirAll(filepath.Dir(localPath), 0755); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}

	fmt.Printf("Downloading to: %s\n", localPath)

	if debug {
		fmt.Printf("URL: %s\n", url)
	}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "*/*")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	req.Header.Set("Connection", "keep-alive")
	req.Header.Set("Range", "bytes=0-")

	if debug {
		fmt.Printf("Request headers: %v\n", req.Header)
	}

	client := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if debug {
				fmt.Printf("Following redirect to: %s\n", req.URL)
			}
			return nil
		},
	}

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to start download: %w", err)
	}
	defer resp.Body.Close()

	if debug {
		fmt.Printf("Response status: %d\n", resp.StatusCode)
		fmt.Printf("Content-Length: %d\n", resp.ContentLength)
		fmt.Printf("Content-Type: %s\n", resp.Header.Get("Content-Type"))
		fmt.Printf("Response headers: %v\n", resp.Header)
	}

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusPartialContent {
		return fmt.Errorf("HTTP error: %d", resp.StatusCode)
	}

	file, err := os.Create(localPath)
	if err != nil {
		return fmt.Errorf("failed to create file: %w", err)
	}
	defer file.Close()

	var bar *progressbar.ProgressBar
	if resp.ContentLength > 0 {
		bar = progressbar.DefaultBytes(resp.ContentLength, "downloading")
		if debug {
			fmt.Printf("File size: %d bytes (%.2f MB)\n", resp.ContentLength, float64(resp.ContentLength)/(1024*1024))
		}
	} else {
		bar = progressbar.DefaultBytes(-1, "downloading")
	}

	buffer := make([]byte, 32*1024)
	written, err := io.CopyBuffer(io.MultiWriter(file, bar), resp.Body, buffer)
	if err != nil {
		os.Remove(localPath)
		return fmt.Errorf("download failed: %w", err)
	}

	_ = written

	if debug {
		log.Printf("Download complete: %d bytes written", written)
	}

	fmt.Printf("\n✅ Download completed: %s\n", localPath)
	return nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
