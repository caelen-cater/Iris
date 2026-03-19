package main

import (
	"encoding/csv"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/pkg/sftp"
	"github.com/spf13/cobra"
	"golang.org/x/crypto/ssh"
	"media-downloader/internal/downloader"
	"media-downloader/internal/serversource"
	"media-downloader/internal/tmdb"
)

type SFTPConfig struct {
	Host     string
	Port     int
	Username string
	Password string
	Path     string
}

type QueueEntry struct {
	ID        string
	StartTime time.Time
}

type QueueManager struct {
	filePath string
}

type EpisodeFile struct {
	ShowTitle   string
	Season      int
	Episode     int
	EpisodeName string
	TMDBID      string
	FilePath    string
}

type CorruptedFile struct {
	Path        string
	Size        int64
	Reason      string
	ShowTitle   string
	Season      int
	Episode     int
	EpisodeName string
	TMDBID      string
	IsMovie     bool
}

func NewQueueManager(filePath string) *QueueManager {
	return &QueueManager{filePath: filePath}
}

type SeasonEpisodeSpec struct {
	Season   int
	Episodes []int
}

func (qm *QueueManager) readQueue() ([]QueueEntry, error) {
	file, err := os.Open(qm.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to read queue: %v", err)
	}
	defer file.Close()

	reader := csv.NewReader(file)
	var entries []QueueEntry

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("failed to read queue: %v", err)
		}
		if len(record) < 2 {
			continue
		}

		startTime, _ := time.Parse(time.RFC3339, record[1])
		entries = append(entries, QueueEntry{
			ID:        record[0],
			StartTime: startTime,
		})
	}

	return entries, nil
}

func (qm *QueueManager) writeQueue(entries []QueueEntry) error {
	file, err := os.Create(qm.filePath)
	if err != nil {
		return fmt.Errorf("failed to write queue: %v", err)
	}
	defer file.Close()

	writer := csv.NewWriter(file)
	defer writer.Flush()

	for _, entry := range entries {
		record := []string{entry.ID, entry.StartTime.Format(time.RFC3339)}
		if err := writer.Write(record); err != nil {
			return fmt.Errorf("failed to write queue entry: %v", err)
		}
	}

	return nil
}

func (qm *QueueManager) claimEntry(id string) error {
	entries, err := qm.readQueue()
	if err != nil {
		return err
	}

	for _, entry := range entries {
		if entry.ID == id {
			return fmt.Errorf("entry %s already exists in queue", id)
		}
	}

	entries = append(entries, QueueEntry{
		ID:        id,
		StartTime: time.Now(),
	})

	return qm.writeQueue(entries)
}

func (qm *QueueManager) releaseEntry(id string) error {
	entries, err := qm.readQueue()
	if err != nil {
		return err
	}

	var newEntries []QueueEntry
	for _, entry := range entries {
		if entry.ID != id {
			newEntries = append(newEntries, entry)
		}
	}

	return qm.writeQueue(newEntries)
}

func (qm *QueueManager) getAvailableEntries() ([]QueueEntry, error) {
	entries, err := qm.readQueue()
	if err != nil {
		return nil, err
	}

	var available []QueueEntry
	for _, entry := range entries {
		if entry.StartTime.IsZero() || time.Since(entry.StartTime) > 24*time.Hour {
			available = append(available, entry)
		}
	}

	return available, nil
}

func setupProxy(proxyStr string) (*http.Transport, error) {
	parts := strings.SplitN(proxyStr, ":", 4)
	if len(parts) < 2 {
		return nil, fmt.Errorf("Failed to setup proxy: %v", "invalid format, expected IP:Port or IP:Port:Username:Password")
	}

	host := parts[0]
	port := parts[1]

	var proxyURL *url.URL
	if len(parts) >= 4 {
		user := parts[2]
		pass := parts[3]
		proxyURL = &url.URL{
			Scheme: "socks5",
			User:   url.UserPassword(user, pass),
			Host:   host + ":" + port,
		}
	} else {
		proxyURL = &url.URL{
			Scheme: "socks5",
			Host:   host + ":" + port,
		}
	}

	log.Printf("Proxy configured: %s:%s", host, port)

	transport := &http.Transport{
		Proxy: http.ProxyURL(proxyURL),
	}

	http.DefaultTransport = transport

	return transport, nil
}

func transferToSFTP(config SFTPConfig, localPath string, debug bool) error {
	if config.Host == "" {
		return nil
	}

	if debug {
		fmt.Printf("SFTP: Connecting to %s:%d\n", config.Host, config.Port)
		fmt.Printf("SFTP: Username: %s\n", config.Username)
	}

	sshConfig := &ssh.ClientConfig{
		User: config.Username,
		Auth: []ssh.AuthMethod{
			ssh.Password(config.Password),
		},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         30 * time.Second,
	}

	addr := fmt.Sprintf("%s:%d", config.Host, config.Port)
	conn, err := ssh.Dial("tcp", addr, sshConfig)
	if err != nil {
		return fmt.Errorf("failed to connect to SFTP server: %v", err)
	}
	defer conn.Close()

	client, err := sftp.NewClient(conn)
	if err != nil {
		return fmt.Errorf("failed to create SFTP client: %v", err)
	}
	defer client.Close()

	if debug {
		fmt.Println("SFTP: Connected successfully")
	}

	localFile, err := os.Open(localPath)
	if err != nil {
		return fmt.Errorf("failed to open local file: %v", err)
	}
	defer localFile.Close()

	localInfo, err := localFile.Stat()
	if err != nil {
		return fmt.Errorf("failed to get file info: %v", err)
	}

	if debug {
		fmt.Printf("SFTP: Local file: %s\n", localPath)
		fmt.Printf("SFTP: Local file size: %d bytes (%.2f MB)\n", localInfo.Size(), float64(localInfo.Size())/(1024*1024))
	}

	relativePath := filepath.Base(filepath.Dir(localPath))
	remotePath := filepath.Join(config.Path, relativePath)

	if debug {
		fmt.Printf("SFTP: Remote path: %s\n", remotePath)
	}

	if err := client.MkdirAll(remotePath); err != nil {
		return fmt.Errorf("failed to create remote directory: %v", err)
	}

	if debug {
		fmt.Printf("SFTP: Created remote directory: %s\n", remotePath)
	}

	remoteFilePath := filepath.Join(remotePath, filepath.Base(localPath))
	if debug {
		fmt.Printf("SFTP: Remote file path: %s\n", remoteFilePath)
	}

	remoteFile, err := client.Create(remoteFilePath)
	if err != nil {
		return fmt.Errorf("failed to create remote file: %v", err)
	}
	defer remoteFile.Close()

	written, err := io.Copy(remoteFile, localFile)
	if err != nil {
		return fmt.Errorf("failed to copy file to SFTP: %v", err)
	}

	if debug {
		fmt.Printf("SFTP: Transferred %d bytes\n", written)
	}

	localFile.Close()
	os.Remove(localPath)

	if debug {
		fmt.Printf("SFTP: Deleted local file: %s\n", localPath)
	}

	fmt.Printf("Successfully transferred %s to SFTP server and deleted local copy\n", filepath.Base(localPath))
	return nil
}

func parseRange(input string, maxVal int) ([]int, error) {
	var result []int
	var exclusions []int
	input = strings.TrimSpace(input)

	if input == "" {
		return nil, fmt.Errorf("empty season specification")
	}

	parts := strings.Split(input, ",")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}

		if strings.HasPrefix(part, "~") {
			numStr := strings.TrimPrefix(part, "~")
			if strings.Contains(numStr, "-") {
				rangeParts := strings.SplitN(numStr, "-", 2)
				start, err := strconv.Atoi(strings.TrimSpace(rangeParts[0]))
				if err != nil {
					return nil, fmt.Errorf("invalid season number: %s", rangeParts[0])
				}
				end, err := strconv.Atoi(strings.TrimSpace(rangeParts[1]))
				if err != nil {
					return nil, fmt.Errorf("invalid season number: %s", rangeParts[1])
				}
				for i := start; i <= end; i++ {
					exclusions = append(exclusions, i)
				}
			} else {
				num, err := strconv.Atoi(strings.TrimSpace(numStr))
				if err != nil {
					return nil, fmt.Errorf("invalid season number: %s", numStr)
				}
				exclusions = append(exclusions, num)
			}
			continue
		}

		if strings.Contains(part, "~") {
			subParts := strings.SplitN(part, "~", 2)
			mainPart := strings.TrimSpace(subParts[0])
			exclPart := strings.TrimSpace(subParts[1])

			exclNum, err := strconv.Atoi(exclPart)
			if err != nil {
				return nil, fmt.Errorf("invalid exclusion format: %s", part)
			}
			exclusions = append(exclusions, exclNum)
			part = mainPart
		}

		if strings.Contains(part, "-") {
			rangeParts := strings.SplitN(part, "-", 2)
			start, err := strconv.Atoi(strings.TrimSpace(rangeParts[0]))
			if err != nil {
				return nil, fmt.Errorf("invalid season number: %s", rangeParts[0])
			}
			end, err := strconv.Atoi(strings.TrimSpace(rangeParts[1]))
			if err != nil {
				return nil, fmt.Errorf("invalid season number: %s", rangeParts[1])
			}

			if start < 1 || end < 1 || start > maxVal || end > maxVal {
				return nil, fmt.Errorf("range %d-%d is out of bounds (1-%d)", start, end, maxVal)
			}

			for i := start; i <= end; i++ {
				result = append(result, i)
			}
		} else {
			num, err := strconv.Atoi(part)
			if err != nil {
				return nil, fmt.Errorf("invalid season number: %s", part)
			}

			if num < 1 || num > maxVal {
				return nil, fmt.Errorf("number %d is out of range (1-%d)", num, maxVal)
			}

			result = append(result, num)
		}
	}

	if len(exclusions) > 0 {
		exclMap := make(map[int]bool)
		for _, e := range exclusions {
			exclMap[e] = true
		}
		var filtered []int
		for _, r := range result {
			if !exclMap[r] {
				filtered = append(filtered, r)
			}
		}
		result = filtered
	}

	if len(result) == 0 {
		return nil, fmt.Errorf("no valid seasons specified")
	}

	return result, nil
}

var episodePattern = regexp.MustCompile(`S(\d+)E(\d+)`)
var tmdbIDPattern = regexp.MustCompile(`\[([^\]]*)\]`)

func parseEpisodeFilename(filename string) (*EpisodeFile, error) {
	matches := tmdbIDPattern.FindStringSubmatch(filename)
	if len(matches) < 2 || matches[1] == "" {
		return nil, fmt.Errorf("invalid filename format: missing TMDB ID")
	}
	tmdbID := matches[1]

	epMatches := episodePattern.FindStringSubmatch(filename)
	if len(epMatches) < 3 {
		return nil, fmt.Errorf("invalid filename format: missing S00E00 pattern")
	}

	season, _ := strconv.Atoi(epMatches[1])
	episode, _ := strconv.Atoi(epMatches[2])

	titleEnd := strings.Index(filename, " - S")
	if titleEnd < 0 {
		return nil, fmt.Errorf("invalid filename format: missing title or episode name")
	}
	showTitle := filename[:titleEnd]

	episodeName := ""
	epNameStart := strings.Index(filename, fmt.Sprintf("S%02dE%02d - ", season, episode))
	if epNameStart >= 0 {
		epNameStart += len(fmt.Sprintf("S%02dE%02d - ", season, episode))
		epNameEnd := strings.LastIndex(filename, " [")
		if epNameEnd > epNameStart {
			episodeName = filename[epNameStart:epNameEnd]
		}
	}

	return &EpisodeFile{
		ShowTitle:   showTitle,
		Season:      season,
		Episode:     episode,
		EpisodeName: episodeName,
		TMDBID:      tmdbID,
		FilePath:    filename,
	}, nil
}

func scanExistingEpisodes(downloadDir, showTitle, tmdbID string) (map[string]*EpisodeFile, error) {
	existing := make(map[string]*EpisodeFile)

	err := filepath.Walk(downloadDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			return nil
		}
		if !strings.HasSuffix(info.Name(), ".mkv") {
			return nil
		}

		ep, err := parseEpisodeFilename(info.Name())
		if err != nil {
			return nil
		}

		key := fmt.Sprintf("S%02dE%02d", ep.Season, ep.Episode)
		ep.FilePath = path
		existing[key] = ep
		return nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to scan existing episodes: %v", err)
	}

	return existing, nil
}

func checkFileIntegrity(filePath string) (bool, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return false, fmt.Errorf("Cannot read file header")
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		return false, fmt.Errorf("Cannot read file header")
	}

	if info.Size() == 0 {
		return false, fmt.Errorf("File appears to be empty or completely corrupted")
	}

	if info.Size() < 1024 {
		return false, fmt.Errorf("File too small (likely incomplete download)")
	}

	checkSize := int64(4096)
	if info.Size() < checkSize {
		checkSize = info.Size()
	}

	buf := make([]byte, checkSize)
	_, err = file.ReadAt(buf, info.Size()-checkSize)
	if err != nil && err != io.EOF {
		return false, fmt.Errorf("Cannot read file header")
	}

	allZeros := true
	for _, b := range buf {
		if b != 0 {
			allZeros = false
			break
		}
	}

	if allZeros {
		ext := strings.ToLower(filepath.Ext(filePath))
		if info.Size() > 100*1024*1024 {
			if ext == ".mkv" {
				return false, fmt.Errorf("Large MKV file ends with all zeros (likely incomplete)")
			}
			if ext == ".mp4" {
				return false, fmt.Errorf("Large MP4 file ends with all zeros (likely incomplete)")
			}
		}
		return false, fmt.Errorf("File ends with all zeros (likely incomplete)")
	}

	return true, nil
}

func downloadWithRetry(dl *downloader.Downloader, streamURL, tmdbID, showTitle, year string, isMovie bool, season, episode, episodeTitle string, sftpConfig SFTPConfig, debug bool) error {
	maxRetries := 3

	for attempt := 1; attempt <= maxRetries; attempt++ {
		if attempt > 1 {
			fmt.Printf("Download attempt %d/%d\n", attempt, maxRetries)
		}

		err := dl.DownloadMedia(streamURL, tmdbID, showTitle, year, isMovie, season, episode, episodeTitle, debug)
		if err != nil {
			fmt.Printf("Download failed (attempt %d/%d): %v\n", attempt, maxRetries, err)
			if attempt < maxRetries {
				time.Sleep(5 * time.Second)
				continue
			}
			return fmt.Errorf("failed to download after %d attempts: %v", maxRetries, err)
		}

		localPath := dl.GetLocalPath(tmdbID, showTitle, year, isMovie, season, episode, episodeTitle)

		ok, integrityErr := checkFileIntegrity(localPath)
		if !ok {
			fmt.Printf("File integrity check failed (attempt %d/%d): %s\n", attempt, maxRetries, integrityErr)
			if attempt < maxRetries {
				os.Remove(localPath)
				time.Sleep(5 * time.Second)
				continue
			}
			return fmt.Errorf("failed to check file integrity after %d attempts: %v", maxRetries, integrityErr)
		}

		if sftpConfig.Host != "" {
			if err := transferToSFTP(sftpConfig, localPath, debug); err != nil {
				fmt.Printf("Warning: Failed to transfer to SFTP: %v\n", err)
			}
		}

		return nil
	}

	return fmt.Errorf("failed to download after %d attempts", maxRetries)
}

func findMissingEpisodes(tmdbClient *tmdb.Client, streamClient *serversource.Client, dl *downloader.Downloader, mediaInfo *tmdb.MediaInfo, seasonRange string, quality string, sftpConfig SFTPConfig, debug bool) error {
	totalSeasons, err := tmdbClient.GetTotalSeasons(mediaInfo.TMDBID)
	if err != nil {
		return fmt.Errorf("failed to get total seasons: %v", err)
	}

	var seasons []int
	if seasonRange != "" {
		seasons, err = parseRange(seasonRange, totalSeasons)
		if err != nil {
			return fmt.Errorf("invalid season format: %v", err)
		}
	} else {
		for i := 1; i <= totalSeasons; i++ {
			seasons = append(seasons, i)
		}
	}

	fmt.Printf("Scanning for missing episodes in seasons %v...\n", seasons)

	existing, err := scanExistingEpisodes(dl.BaseDir(), mediaInfo.Title, mediaInfo.IMDBId)
	if err != nil {
		log.Printf("Warning: Failed to scan existing episodes: %v", err)
		existing = make(map[string]*EpisodeFile)
	}

	fmt.Printf("Found %d existing episodes\n", len(existing))

	var missing []struct {
		Season  int
		Episode int
		Info    *tmdb.EpisodeInfo
	}

	for _, seasonNum := range seasons {
		seasonStr := strconv.Itoa(seasonNum)
		episodes, err := tmdbClient.GetSeasonInfo(mediaInfo.TMDBID, seasonStr)
		if err != nil {
			log.Printf("Warning: Failed to get Season %d info: %v", seasonNum, err)
			continue
		}

		fmt.Printf("Checking Season %d (%d episodes)...\n", seasonNum, len(episodes))

		for _, ep := range episodes {
			key := fmt.Sprintf("S%02dE%02d", seasonNum, ep.EpisodeNumber)
			if _, exists := existing[key]; !exists {
				info := ep
				missing = append(missing, struct {
					Season  int
					Episode int
					Info    *tmdb.EpisodeInfo
				}{
					Season:  seasonNum,
					Episode: ep.EpisodeNumber,
					Info:    &info,
				})
			}
		}
	}

	if len(missing) == 0 {
		fmt.Println("No missing episodes found!")
		return nil
	}

	fmt.Printf("Found %d missing episodes. Starting download...\n", len(missing))

	downloaded := 0
	for _, m := range missing {
		seasonStr := strconv.Itoa(m.Season)
		epStr := strconv.Itoa(m.Episode)

		fmt.Printf("\nFetching S%d E%d: %s...\n", m.Season, m.Episode, m.Info.Name)

		streamURL, err := streamClient.GetStreamByQuality(mediaInfo.IMDBId, "series", seasonStr, epStr, quality)
		if err != nil {
			fmt.Printf("Warning: No stream found for S%d E%d: %s\n", m.Season, m.Episode, m.Info.Name)
			continue
		}

		err = downloadWithRetry(dl, streamURL, mediaInfo.IMDBId, mediaInfo.Title, mediaInfo.Year, false, seasonStr, epStr, m.Info.Name, sftpConfig, debug)
		if err != nil {
			log.Printf("Failed to download S%d E%d: %v", m.Season, m.Episode, err)
			continue
		}

		downloaded++
	}

	fmt.Printf("Downloaded %d missing episodes\n", downloaded)
	return nil
}

func findMissingForAllShows(downloadDir string, tmdbClient *tmdb.Client, streamClient *serversource.Client, dl *downloader.Downloader, quality string, sftpConfig SFTPConfig, debug bool) error {
	entries, err := os.ReadDir(downloadDir)
	if err != nil {
		return fmt.Errorf("failed to read download directory: %v", err)
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		id := extractTMDBIDFromFolder(name)
		if id == "" {
			continue
		}

		mediaInfo, err := tmdbClient.GetMediaInfo(id, false)
		if err != nil {
			fmt.Printf("Warning: Failed to get media info for TMDB ID %s: %v\n", id, err)
			continue
		}

		fmt.Printf("Checking for missing episodes in: %s [%s]\n", mediaInfo.Title, id)

		err = findMissingEpisodes(tmdbClient, streamClient, dl, mediaInfo, "", quality, sftpConfig, debug)
		if err != nil {
			fmt.Printf("Failed to find missing episodes for %s: %v\n", mediaInfo.Title, err)
			continue
		}
	}

	return nil
}

var (
	tmdbID      string
	season      string
	episode     string
	rdKey       string
	downloadDir string
	outputPath  string
	quality     string
	serviceURL  string
	sftpHost    string
	sftpPort    int
	sftpUser    string
	sftpPass    string
	sftpPath    string
	findMissing bool
	useRemote   bool
	checkFlag   bool
	mediaType   string
	debugFlag   bool
	proxyFlag   string
	queueFlag   bool
)

func main() {
	var rootCmd = &cobra.Command{
		Use:   "media-downloader",
		Short: "A media downloader CLI tool",
		Long: `================================================
           MEDIA DOWNLOADER CLI
================================================

Download movies and TV shows using TMDB and streaming services.

Learn more at https://caelen.dev  
Source available at: https://github.com/caelen-cater/Iris/tree/cli-core  
Licensed under the Apache License, Version 2.0`,
		Run: runDownloader,
	}

	rootCmd.Flags().StringVarP(&tmdbID, "tmdb-id", "t", "", "TMDB ID of the media (required for downloads)")
	rootCmd.Flags().StringVarP(&season, "season", "s", "", "Season number(s) (for TV shows). Supports: 2-8, 1,3,5, 2-4,6,8~3, ~1")
	rootCmd.Flags().StringVarP(&episode, "episode", "e", "", "Episode number(s) (for TV shows). Supports: 2-8, 1,3,5, 2-4,6,8~3, ~1")
	rootCmd.Flags().StringVarP(&rdKey, "rd-key", "r", "", "Real-Debrid API key (required)")
	rootCmd.Flags().StringVarP(&downloadDir, "download-dir", "d", "./", "Download directory (ignored when --output-path is set)")
	rootCmd.Flags().StringVar(&outputPath, "output-path", "", "Full output file path (when set, app specifies exact path)")
	rootCmd.Flags().StringVarP(&quality, "quality", "q", "", "Video quality preference (defaults to highest available)")
	rootCmd.Flags().StringVarP(&serviceURL, "service-url", "u", "", "Streaming service URL (required)")
	rootCmd.Flags().StringVar(&sftpHost, "sftp-host", "", "SFTP host")
	rootCmd.Flags().IntVar(&sftpPort, "sftp-port", 22, "SFTP port (default: 22)")
	rootCmd.Flags().StringVar(&sftpUser, "sftp-user", "", "SFTP username")
	rootCmd.Flags().StringVar(&sftpPass, "sftp-pass", "", "SFTP password")
	rootCmd.Flags().StringVar(&sftpPath, "sftp-path", "", "SFTP remote path")
	rootCmd.Flags().BoolVarP(&findMissing, "find-missing", "m", false, "Find and download missing episodes in specified season range")
	rootCmd.Flags().BoolVar(&useRemote, "use-remote", false, "Use Real-Debrid remote traffic")
	rootCmd.Flags().BoolVarP(&checkFlag, "check", "c", false, "Check for corrupted/incomplete files and redownload them")
	rootCmd.Flags().StringVarP(&mediaType, "type", "y", "", "Media type: 'movie' or 'tv' (required for downloads)")
	rootCmd.Flags().BoolVar(&debugFlag, "debug", false, "Enable debug output")
	rootCmd.Flags().StringVarP(&proxyFlag, "proxy", "p", "", "HTTP proxy in format IP:Port:Username:Password")
	rootCmd.Flags().BoolVar(&queueFlag, "queue", false, "Use queue system for coordination")

	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

func runDownloader(cmd *cobra.Command, args []string) {
	sftpConfig := SFTPConfig{
		Host:     sftpHost,
		Port:     sftpPort,
		Username: sftpUser,
		Password: sftpPass,
		Path:     sftpPath,
	}

	if proxyFlag != "" {
		_, err := setupProxy(proxyFlag)
		if err != nil {
			log.Fatalf("Failed to setup proxy: %v", err)
		}
	}

	// App-specified path mode: download directly to the given path
	if outputPath != "" {
		if serviceURL == "" || rdKey == "" {
			log.Fatal("Service URL and Real-Debrid API key are required")
		}
		if tmdbID == "" || mediaType == "" {
			log.Fatal("tmdb-id and type are required when using --output-path")
		}
		isMovie := mediaType == "movie"
		if !isMovie && (season == "" || episode == "") {
			log.Fatal("season and episode are required for TV when using --output-path")
		}
		tmdbClient := tmdb.NewClient()
		streamClient := serversource.NewClient(rdKey, serviceURL)
		dl := downloader.New(".")
		mediaInfo, err := tmdbClient.GetMediaInfo(tmdbID, isMovie)
		if err != nil {
			log.Fatalf("Failed to get media info: %v", err)
		}
		if mediaInfo.IMDBId == "" {
			log.Fatal("Could not find IMDB ID for this media")
		}
		fmt.Println("Looking up media information...")
		var streamURL string
		if isMovie {
			streamURL, err = streamClient.GetStreamByQuality(mediaInfo.IMDBId, "movie", "", "", quality)
		} else {
			streamURL, err = streamClient.GetStreamByQuality(mediaInfo.IMDBId, "series", season, episode, quality)
		}
		if err != nil {
			log.Fatalf("No stream found: %v", err)
		}
		if err := dl.DownloadToPath(streamURL, outputPath, debugFlag); err != nil {
			log.Fatalf("Download failed: %v", err)
		}
		ok, integrityErr := checkFileIntegrity(outputPath)
		if !ok {
			os.Remove(outputPath)
			log.Fatalf("File integrity check failed: %v", integrityErr)
		}
		if sftpConfig.Host != "" {
			if err := transferToSFTP(sftpConfig, outputPath, debugFlag); err != nil {
				fmt.Printf("Warning: Failed to transfer to SFTP: %v\n", err)
			}
		}
		fmt.Println("\n✅ Download completed successfully!")
		return
	}

	if queueFlag {
		if serviceURL == "" {
			log.Fatal("Service URL is required for queue operation")
		}
		if rdKey == "" {
			log.Fatal("Real-Debrid API key is required for queue operation")
		}

		tmdbClient := tmdb.NewClient()
		streamClient := serversource.NewClient(rdKey, serviceURL)
		dl := downloader.New(downloadDir)

		err := processQueue(tmdbClient, streamClient, dl, quality, sftpConfig, debugFlag)
		if err != nil {
			log.Fatalf("Failed to process queue: %v", err)
		}
		return
	}

	if checkFlag {
		if serviceURL == "" {
			log.Fatal("Service URL is required for check operation")
		}
		if rdKey == "" {
			log.Fatal("Real-Debrid API key is required for check operation")
		}

		tmdbClient := tmdb.NewClient()
		streamClient := serversource.NewClient(rdKey, serviceURL)
		dl := downloader.New(downloadDir)

		corruptedFiles, err := scanForCorruptedFiles(downloadDir, mediaType, tmdbID)
		if err != nil {
			log.Fatalf("Failed to scan for corrupted files: %v", err)
		}

		if len(corruptedFiles) == 0 {
			fmt.Println("No corrupted files found!")
			return
		}

		fmt.Printf("Found %d corrupted/incomplete files. Starting redownload...\n", len(corruptedFiles))

		err = redownloadCorruptedFiles(tmdbClient, streamClient, dl, corruptedFiles, quality, sftpConfig, debugFlag)
		if err != nil {
			log.Fatalf("Failed to redownload corrupted files: %v", err)
		}

		return
	}

	if findMissing {
		if serviceURL == "" {
			log.Fatal("Service URL is required for find-missing operation")
		}
		if rdKey == "" {
			log.Fatal("Real-Debrid API key is required for find-missing operation")
		}

		tmdbClient := tmdb.NewClient()
		streamClient := serversource.NewClient(rdKey, serviceURL)
		dl := downloader.New(downloadDir)

		if tmdbID != "" {
			mediaInfo, err := tmdbClient.GetMediaInfo(tmdbID, false)
			if err != nil {
				log.Fatalf("Failed to get media info: %v", err)
			}

			if mediaInfo.IMDBId == "" {
				log.Fatal("Could not find IMDB ID for this media")
			}

			err = findMissingEpisodes(tmdbClient, streamClient, dl, mediaInfo, season, quality, sftpConfig, debugFlag)
			if err != nil {
				log.Fatalf("Failed to find missing episodes: %v", err)
			}
		} else {
			err := findMissingForAllShows(downloadDir, tmdbClient, streamClient, dl, quality, sftpConfig, debugFlag)
			if err != nil {
				log.Fatalf("Failed to find missing episodes for all shows: %v", err)
			}
		}

		return
	}

	if tmdbID == "" {
		log.Fatal("TMDB ID is required for download operations")
	}
	if serviceURL == "" {
		log.Fatal("Service URL is required")
	}
	if rdKey == "" {
		log.Fatal("Real-Debrid API key is required")
	}

	tmdbClient := tmdb.NewClient()
	streamClient := serversource.NewClient(rdKey, serviceURL)
	dl := downloader.New(downloadDir)

	isMovie := mediaType == "movie"

	if season != "" || episode != "" {
		if episode != "" && season == "" {
			log.Fatal("Episode flag can only be used with season flag for TV shows")
		}
		isMovie = false
	}

	queueType := mediaType
	if queueType == "" {
		if isMovie {
			queueType = "movie"
		} else {
			queueType = "tv"
		}
	}
	if err := addToQueue(queueType, tmdbID); err != nil {
		log.Printf("Warning: Failed to add to queue: %v", err)
	}

	fmt.Println("Looking up media information...")

	mediaInfo, err := tmdbClient.GetMediaInfo(tmdbID, isMovie)
	if err != nil {
		log.Fatalf("Failed to get media info: %v", err)
	}

	if mediaInfo.IMDBId == "" {
		log.Fatal("Could not find IMDB ID for this media")
	}

	if episode != "" && season != "" {
		handleSpecificEpisodes(tmdbClient, streamClient, dl, mediaInfo, quality, sftpConfig, debugFlag)
	} else if season != "" {
		handleSeasonDownloads(tmdbClient, streamClient, dl, mediaInfo, quality, sftpConfig, debugFlag)
	} else {
		handleFullMediaDownload(tmdbClient, streamClient, dl, mediaInfo, isMovie, quality, sftpConfig, debugFlag)
	}

	fmt.Println("\n✅ Download completed successfully!")
}

func handleSpecificEpisodes(tmdbClient *tmdb.Client, streamClient *serversource.Client, dl *downloader.Downloader, mediaInfo *tmdb.MediaInfo, quality string, sftpConfig SFTPConfig, debug bool) {
	totalSeasons, err := tmdbClient.GetTotalSeasons(mediaInfo.TMDBID)
	if err != nil {
		log.Fatalf("Failed to get total seasons: %v", err)
	}

	seasons, err := parseRange(season, totalSeasons)
	if err != nil {
		log.Fatalf("Invalid season format: %v", err)
	}

	for _, seasonNum := range seasons {
		seasonStr := strconv.Itoa(seasonNum)
		allEpisodes, err := tmdbClient.GetSeasonInfo(mediaInfo.TMDBID, seasonStr)
		if err != nil {
			log.Printf("Warning: Failed to get Season %d info: %v", seasonNum, err)
			continue
		}

		episodesToDownload, err := parseRange(episode, len(allEpisodes))
		if err != nil {
			log.Fatalf("invalid episode specification for season %d: %v", seasonNum, err)
		}

		if len(episodesToDownload) == 0 {
			fmt.Printf("Warning: No valid episodes specified for Season %d\n", seasonNum)
			continue
		}

		fmt.Printf("Downloading Season %d (%d episodes)\n", seasonNum, len(allEpisodes))

		for _, epNum := range episodesToDownload {
			if epNum > len(allEpisodes) {
				fmt.Printf("Warning: Episode %d does not exist in Season %d\n", epNum, seasonNum)
				continue
			}

			var episodeInfo *tmdb.EpisodeInfo
			for _, ep := range allEpisodes {
				if ep.EpisodeNumber == epNum {
					info := ep
					episodeInfo = &info
					break
				}
			}

			epName := fmt.Sprintf("Episode %d", epNum)
			if episodeInfo != nil {
				epName = episodeInfo.Name
			}

			epStr := strconv.Itoa(epNum)
			fmt.Printf("\nFetching S%d E%d: %s...\n", seasonNum, epNum, epName)

			if useRemote {
				fmt.Printf("Using Real-Debrid remote traffic for S%d E%d\n", seasonNum, epNum)
				streamURL, streamErr := streamClient.GetStreamByQualityFallback(mediaInfo.IMDBId, "series", seasonStr, epStr)
				if streamErr != nil {
					fmt.Printf("Warning: No stream found for S%d E%d: %s\n", seasonNum, epNum, epName)
					continue
				}
				magnetURL := getMagnetFromStreamURL(streamURL)
				if magnetURL != "" {
					rdErr := addToRealDebridRemote(rdKey, magnetURL, debug)
					if rdErr != nil {
						fmt.Printf("Failed to add S%d E%d to Real-Debrid remote traffic: %v\n", seasonNum, epNum, rdErr)
					} else {
						fmt.Printf("Added S%d E%d to Real-Debrid remote traffic\n", seasonNum, epNum)
					}
				} else {
					fmt.Printf("Failed to convert stream URL to magnet for S%d E%d: %v\n", seasonNum, epNum, streamErr)
				}
				continue
			}

			streamURL, streamErr := streamClient.GetStreamByQuality(mediaInfo.IMDBId, "series", seasonStr, epStr, quality)
			if streamErr != nil {
				fmt.Printf("Warning: No stream found for S%d E%d: %s\n", seasonNum, epNum, epName)
				continue
			}

			dlErr := downloadWithRetry(dl, streamURL, tmdbID, mediaInfo.Title, mediaInfo.Year, false, seasonStr, epStr, epName, sftpConfig, debug)
			if dlErr != nil {
				log.Printf("Failed to download S%d E%d: %v", seasonNum, epNum, dlErr)
				continue
			}
		}
	}
}

func handleSeasonDownloads(tmdbClient *tmdb.Client, streamClient *serversource.Client, dl *downloader.Downloader, mediaInfo *tmdb.MediaInfo, quality string, sftpConfig SFTPConfig, debug bool) {
	totalSeasons, err := tmdbClient.GetTotalSeasons(mediaInfo.TMDBID)
	if err != nil {
		log.Fatalf("Failed to get total seasons: %v", err)
	}

	seasons, err := parseRange(season, totalSeasons)
	if err != nil {
		log.Fatalf("Invalid season format: %v", err)
	}

	fmt.Printf("Downloading %d season(s): %v\n", len(seasons), seasons)

	for _, seasonNum := range seasons {
		seasonStr := strconv.Itoa(seasonNum)
		episodes, err := tmdbClient.GetSeasonInfo(mediaInfo.TMDBID, seasonStr)
		if err != nil {
			log.Printf("Warning: Failed to get Season %d info: %v", seasonNum, err)
			continue
		}

		fmt.Printf("\n--- Season %d (%d episodes) ---\n", seasonNum, len(episodes))

		for _, ep := range episodes {
			epNum := strconv.Itoa(ep.EpisodeNumber)
			fmt.Printf("\nFetching S%d E%d: %s...\n", seasonNum, ep.EpisodeNumber, ep.Name)

			if useRemote {
				fmt.Printf("Using Real-Debrid remote traffic for S%d E%d\n", seasonNum, ep.EpisodeNumber)
				streamURL, streamErr := streamClient.GetStreamByQualityFallback(mediaInfo.IMDBId, "series", seasonStr, epNum)
				if streamErr != nil {
					fmt.Printf("Warning: No stream found for S%d E%d: %s\n", seasonNum, ep.EpisodeNumber, ep.Name)
					continue
				}
				magnetURL := getMagnetFromStreamURL(streamURL)
				if magnetURL != "" {
					rdErr := addToRealDebridRemote(rdKey, magnetURL, debug)
					if rdErr != nil {
						fmt.Printf("Failed to add S%d E%d to Real-Debrid remote traffic: %v\n", seasonNum, ep.EpisodeNumber, rdErr)
					} else {
						fmt.Printf("Added S%d E%d to Real-Debrid remote traffic\n", seasonNum, ep.EpisodeNumber)
					}
				} else {
					fmt.Printf("Failed to convert stream URL to magnet for S%d E%d: %v\n", seasonNum, ep.EpisodeNumber, streamErr)
				}
				continue
			}

			streamURL, streamErr := streamClient.GetStreamByQuality(mediaInfo.IMDBId, "series", seasonStr, epNum, quality)
			if streamErr != nil {
				fmt.Printf("Warning: No stream found for S%d E%d: %s\n", seasonNum, ep.EpisodeNumber, ep.Name)
				continue
			}

			dlErr := downloadWithRetry(dl, streamURL, tmdbID, mediaInfo.Title, mediaInfo.Year, false, seasonStr, epNum, ep.Name, sftpConfig, debug)
			if dlErr != nil {
				log.Printf("Failed to download S%d E%d: %v", seasonNum, ep.EpisodeNumber, dlErr)
				continue
			}
		}
	}
}

func handleFullMediaDownload(tmdbClient *tmdb.Client, streamClient *serversource.Client, dl *downloader.Downloader, mediaInfo *tmdb.MediaInfo, isMovie bool, quality string, sftpConfig SFTPConfig, debug bool) {
	if isMovie {
		if useRemote {
			fmt.Println("Using Real-Debrid remote traffic for movie")
			streamURL, err := streamClient.GetStreamByQualityFallback(mediaInfo.IMDBId, "movie", "", "")
			if err != nil {
				log.Fatalf("No stream found for movie: %v", err)
			}
			magnetURL := getMagnetFromStreamURL(streamURL)
			if magnetURL != "" {
				err = addToRealDebridRemote(rdKey, magnetURL, debug)
				if err != nil {
					log.Fatalf("Failed to add movie to Real-Debrid remote traffic: %v", err)
				}
				fmt.Println("Added movie to Real-Debrid remote traffic")
			} else {
				log.Fatalf("Failed to convert stream URL to magnet for movie: %v", err)
			}
			return
		}

		fmt.Println("Fetching movie stream...")
		streamURL, err := streamClient.GetStreamByQuality(mediaInfo.IMDBId, "movie", "", "", quality)
		if err != nil {
			log.Fatalf("No stream found for movie: %v", err)
		}

		err = downloadWithRetry(dl, streamURL, tmdbID, mediaInfo.Title, mediaInfo.Year, true, "", "", "", sftpConfig, debug)
		if err != nil {
			log.Fatalf("Download failed: %v", err)
		}
	} else {
		totalSeasons, err := tmdbClient.GetTotalSeasons(mediaInfo.TMDBID)
		if err != nil {
			log.Fatalf("Failed to get total seasons: %v", err)
		}

		fmt.Printf("Downloading entire TV show: %s (%d seasons)\n", mediaInfo.Title, totalSeasons)

		for seasonNum := 1; seasonNum <= totalSeasons; seasonNum++ {
			seasonStr := strconv.Itoa(seasonNum)
			fmt.Printf("\n--- Season %d ---\n", seasonNum)

			episodes, err := tmdbClient.GetSeasonInfo(mediaInfo.TMDBID, seasonStr)
			if err != nil {
				log.Printf("Warning: Failed to get Season %d info: %v", seasonNum, err)
				continue
			}

			for _, ep := range episodes {
				epNum := strconv.Itoa(ep.EpisodeNumber)
				fmt.Printf("\nFetching S%d E%d: %s...\n", seasonNum, ep.EpisodeNumber, ep.Name)

				if useRemote {
					fmt.Printf("Using Real-Debrid remote traffic for S%d E%d\n", seasonNum, ep.EpisodeNumber)
					streamURL, streamErr := streamClient.GetStreamByQualityFallback(mediaInfo.IMDBId, "series", seasonStr, epNum)
					if streamErr != nil {
						fmt.Printf("Warning: No stream found for S%d E%d: %s\n", seasonNum, ep.EpisodeNumber, ep.Name)
						continue
					}
					magnetURL := getMagnetFromStreamURL(streamURL)
					if magnetURL != "" {
						rdErr := addToRealDebridRemote(rdKey, magnetURL, debug)
						if rdErr != nil {
							fmt.Printf("Failed to add S%d E%d to Real-Debrid remote traffic: %v\n", seasonNum, ep.EpisodeNumber, rdErr)
						} else {
							fmt.Printf("Added S%d E%d to Real-Debrid remote traffic\n", seasonNum, ep.EpisodeNumber)
						}
					} else {
						fmt.Printf("Failed to convert stream URL to magnet for S%d E%d: %v\n", seasonNum, ep.EpisodeNumber, streamErr)
					}
					continue
				}

				streamURL, streamErr := streamClient.GetStreamByQuality(mediaInfo.IMDBId, "series", seasonStr, epNum, quality)
				if streamErr != nil {
					fmt.Printf("Warning: No stream found for S%d E%d: %s\n", seasonNum, ep.EpisodeNumber, ep.Name)
					continue
				}

				dlErr := downloadWithRetry(dl, streamURL, tmdbID, mediaInfo.Title, mediaInfo.Year, false, seasonStr, epNum, ep.Name, sftpConfig, debug)
				if dlErr != nil {
					log.Printf("Failed to download S%d E%d: %v", seasonNum, ep.EpisodeNumber, dlErr)
					continue
				}
			}
		}
	}
}

func addToRealDebridRemote(rdKey, magnetURL string, debug bool) error {
	if debug {
		fmt.Printf("Real-Debrid: Adding magnet to remote traffic: %s\n", magnetURL)
	}

	apiURL := "https://api.real-debrid.com/rest/1.0/torrents/addMagnet"

	data := url.Values{}
	data.Set("magnet", magnetURL)

	req, err := http.NewRequest("POST", apiURL, strings.NewReader(data.Encode()))
	if err != nil {
		return fmt.Errorf("failed to create Real-Debrid request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+rdKey)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send Real-Debrid request: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if debug {
		fmt.Printf("Real-Debrid: Response status: %d\n", resp.StatusCode)
		fmt.Printf("Real-Debrid: Response: %+v\n", string(body))
	}

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("Real-Debrid API error: %d - %s", resp.StatusCode, string(body))
	}

	fmt.Println("Successfully added to Real-Debrid remote traffic")
	return nil
}

func getMagnetFromStreamURL(streamURL string) string {
	if strings.HasPrefix(streamURL, "magnet:") {
		return streamURL
	}

	log.Printf("magnet conversion not implemented - need to add logic to convert stream URL to magnet link")
	return ""
}

func scanForCorruptedFiles(downloadDir, mediaTypeFilter, tmdbIDFilter string) ([]*CorruptedFile, error) {
	var corrupted []*CorruptedFile

	err := filepath.Walk(downloadDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			return nil
		}

		ext := strings.ToLower(filepath.Ext(path))
		if ext != ".mkv" && ext != ".mp4" {
			return nil
		}

		ok, reason := checkFileIntegrity(path)
		if ok {
			return nil
		}

		cf := &CorruptedFile{
			Path:   path,
			Size:   info.Size(),
			Reason: reason.Error(),
		}

		ep, parseErr := parseEpisodeFilename(filepath.Base(path))
		if parseErr == nil {
			cf.ShowTitle = ep.ShowTitle
			cf.Season = ep.Season
			cf.Episode = ep.Episode
			cf.EpisodeName = ep.EpisodeName
			cf.TMDBID = ep.TMDBID
			cf.IsMovie = false
		} else {
			matches := tmdbIDPattern.FindStringSubmatch(filepath.Base(path))
			if len(matches) >= 2 {
				cf.TMDBID = matches[1]
			}
			cf.IsMovie = !strings.Contains(filepath.Base(path), " - S")
		}

		corrupted = append(corrupted, cf)
		return nil
	})

	if err != nil {
		return nil, err
	}

	return corrupted, nil
}

func redownloadCorruptedFiles(tmdbClient *tmdb.Client, streamClient *serversource.Client, dl *downloader.Downloader, corruptedFiles []*CorruptedFile, quality string, sftpConfig SFTPConfig, debug bool) error {
	for _, cf := range corruptedFiles {
		fmt.Printf("\nRedownloading: %s\n", cf.Path)
		fmt.Printf("  Reason: %s\n", cf.Reason)

		if cf.TMDBID == "" {
			fmt.Printf("  Skipping - no TMDB ID found\n")
			continue
		}

		if err := os.Remove(cf.Path); err != nil {
			fmt.Printf("Warning: Failed to delete corrupted file %s: %v\n", cf.Path, err)
		}

		if cf.IsMovie {
			mediaInfo, err := tmdbClient.GetMediaInfo(cf.TMDBID, true)
			if err != nil {
				fmt.Printf("Failed to get media info for %s: %v\n", cf.TMDBID, err)
				continue
			}

			streamURL, err := streamClient.GetStreamByQuality(mediaInfo.IMDBId, "movie", "", "", quality)
			if err != nil {
				fmt.Printf("No stream found for movie: %v\n", err)
				continue
			}

			err = downloadWithRetry(dl, streamURL, cf.TMDBID, mediaInfo.Title, mediaInfo.Year, true, "", "", "", sftpConfig, debug)
			if err != nil {
				fmt.Printf("Failed to redownload movie: %v\n", err)
				continue
			}
		} else {
			mediaInfo, err := tmdbClient.GetMediaInfo(cf.TMDBID, false)
			if err != nil {
				fmt.Printf("Failed to get media info for %s: %v\n", cf.TMDBID, err)
				continue
			}

			seasonStr := strconv.Itoa(cf.Season)
			epStr := strconv.Itoa(cf.Episode)

			streamURL, err := streamClient.GetStreamByQuality(mediaInfo.IMDBId, "series", seasonStr, epStr, quality)
			if err != nil {
				fmt.Printf("Warning: No stream found for S%d E%d: %v\n", cf.Season, cf.Episode, err)
				continue
			}

			err = downloadWithRetry(dl, streamURL, cf.TMDBID, mediaInfo.Title, mediaInfo.Year, false, seasonStr, epStr, cf.EpisodeName, sftpConfig, debug)
			if err != nil {
				fmt.Printf("Failed to redownload S%d E%d: %v\n", cf.Season, cf.Episode, err)
				continue
			}
		}
	}

	return nil
}

func parseSeasonEpisodeSpec(input string, maxSeasons int) ([]SeasonEpisodeSpec, error) {
	var result []SeasonEpisodeSpec
	input = strings.TrimSpace(input)

	if input == "" {
		return nil, fmt.Errorf("empty season specification")
	}

	specPattern := regexp.MustCompile(`^([^[]+)\[([^\]]*)\]$`)

	parts := strings.Split(input, ",")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}

		matches := specPattern.FindStringSubmatch(part)
		if matches != nil {
			seasonStr := strings.TrimSpace(matches[1])
			episodeStr := strings.TrimSpace(matches[2])

			seasonNum, err := strconv.Atoi(seasonStr)
			if err != nil {
				return nil, fmt.Errorf("invalid season number: %s", seasonStr)
			}

			if seasonNum < 1 || seasonNum > maxSeasons {
				return nil, fmt.Errorf("season %d is out of range (1-%d)", seasonNum, maxSeasons)
			}

			episodes, err := parseEpisodeSpec(episodeStr)
			if err != nil {
				return nil, fmt.Errorf("invalid episode specification for season %d: %v", seasonNum, err)
			}

			result = append(result, SeasonEpisodeSpec{
				Season:   seasonNum,
				Episodes: episodes,
			})
		} else {
			if strings.Contains(part, "(") || strings.Contains(part, ")") {
				return nil, fmt.Errorf("invalid parentheses in season specification: %s", part)
			}

			seasonNum, err := strconv.Atoi(part)
			if err != nil {
				return nil, fmt.Errorf("invalid season number: %s", part)
			}

			if seasonNum < 1 || seasonNum > maxSeasons {
				return nil, fmt.Errorf("season %d is out of range (1-%d)", seasonNum, maxSeasons)
			}

			result = append(result, SeasonEpisodeSpec{
				Season:   seasonNum,
				Episodes: nil,
			})
		}
	}

	if len(result) == 0 {
		return nil, fmt.Errorf("No valid seasons specified")
	}

	return result, nil
}

func parseEpisodeSpec(input string) ([]int, error) {
	var result []int
	input = strings.TrimSpace(input)

	if input == "" {
		return nil, nil
	}

	exclusions := make(map[int]bool)
	var inclusions []int

	parts := strings.Split(input, ",")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}

		if strings.HasPrefix(part, "~") {
			numStr := strings.TrimPrefix(part, "~")
			if strings.Contains(numStr, "-") {
				rangeParts := strings.SplitN(numStr, "-", 2)
				start, err := strconv.Atoi(strings.TrimSpace(rangeParts[0]))
				if err != nil {
					return nil, fmt.Errorf("invalid exclusion format: %s", part)
				}
				end, err := strconv.Atoi(strings.TrimSpace(rangeParts[1]))
				if err != nil {
					return nil, fmt.Errorf("invalid exclusion format: %s", part)
				}
				for i := start; i <= end; i++ {
					exclusions[i] = true
				}
			} else {
				num, err := strconv.Atoi(strings.TrimSpace(numStr))
				if err != nil {
					return nil, fmt.Errorf("invalid exclusion format: %s", part)
				}
				exclusions[num] = true
			}
		} else if strings.Contains(part, "~") {
			subParts := strings.SplitN(part, "~", 2)
			mainPart := strings.TrimSpace(subParts[0])
			exclPart := strings.TrimSpace(subParts[1])

			exclNum, err := strconv.Atoi(exclPart)
			if err != nil {
				return nil, fmt.Errorf("invalid exclusion format: %s", part)
			}
			exclusions[exclNum] = true

			if strings.Contains(mainPart, "-") {
				rangeParts := strings.SplitN(mainPart, "-", 2)
				start, err := strconv.Atoi(strings.TrimSpace(rangeParts[0]))
				if err != nil {
					return nil, fmt.Errorf("invalid episode number: %s", rangeParts[0])
				}
				end, err := strconv.Atoi(strings.TrimSpace(rangeParts[1]))
				if err != nil {
					return nil, fmt.Errorf("invalid episode number: %s", rangeParts[1])
				}
				for i := start; i <= end; i++ {
					inclusions = append(inclusions, i)
				}
			} else {
				num, err := strconv.Atoi(mainPart)
				if err != nil {
					return nil, fmt.Errorf("invalid episode number: %s", mainPart)
				}
				inclusions = append(inclusions, num)
			}
		} else if strings.Contains(part, "-") {
			rangeParts := strings.SplitN(part, "-", 2)
			start, err := strconv.Atoi(strings.TrimSpace(rangeParts[0]))
			if err != nil {
				return nil, fmt.Errorf("invalid episode number: %s", rangeParts[0])
			}
			end, err := strconv.Atoi(strings.TrimSpace(rangeParts[1]))
			if err != nil {
				return nil, fmt.Errorf("invalid episode number: %s", rangeParts[1])
			}
			for i := start; i <= end; i++ {
				inclusions = append(inclusions, i)
			}
		} else {
			num, err := strconv.Atoi(part)
			if err != nil {
				return nil, fmt.Errorf("invalid episode number: %s", part)
			}
			inclusions = append(inclusions, num)
		}
	}

	seen := make(map[int]bool)
	for _, ep := range inclusions {
		if !exclusions[ep] && !seen[ep] {
			result = append(result, ep)
			seen[ep] = true
		}
	}

	return result, nil
}

func extractTMDBIDFromFolder(folderName string) string {
	matches := tmdbIDPattern.FindStringSubmatch(folderName)
	if len(matches) >= 2 {
		return matches[1]
	}
	return ""
}

func processQueue(tmdbClient *tmdb.Client, streamClient *serversource.Client, dl *downloader.Downloader, quality string, sftpConfig SFTPConfig, debug bool) error {
	queueManager := NewQueueManager("./queue.csv")

	entries, err := queueManager.getAvailableEntries()
	if err != nil {
		return fmt.Errorf("Failed to process queue: %v", err)
	}

	if len(entries) == 0 {
		fmt.Println("No available entries in queue")
		return nil
	}

	fmt.Printf("Found %d available entries in queue\n", len(entries))

	for _, entry := range entries {
		if err := queueManager.claimEntry(entry.ID); err != nil {
			fmt.Printf("Failed to claim entry %s: %v\n", entry.ID, err)
			continue
		}

		parts := strings.SplitN(entry.ID, "-", 2)
		if len(parts) < 2 {
			fmt.Printf("Invalid media type: %s\n", entry.ID)
			if err := queueManager.releaseEntry(entry.ID); err != nil {
				fmt.Printf("Failed to release entry %s: %v\n", entry.ID, err)
			}
			continue
		}

		entryMediaType := parts[0]
		entryTMDBID := parts[1]

		isMovie := entryMediaType == "movie"
		mediaInfo, err := tmdbClient.GetMediaInfo(entryTMDBID, isMovie)
		if err != nil {
			fmt.Printf("Failed to get media info for %s: %v\n", entryTMDBID, err)
			if err := queueManager.releaseEntry(entry.ID); err != nil {
				fmt.Printf("Failed to release entry %s: %v\n", entry.ID, err)
			}
			continue
		}

		if isMovie {
			streamURL, err := streamClient.GetStreamByQuality(mediaInfo.IMDBId, "movie", "", "", quality)
			if err != nil {
				fmt.Printf("No stream found for movie: %v\n", err)
				if err := queueManager.releaseEntry(entry.ID); err != nil {
					fmt.Printf("Failed to release entry %s: %v\n", entry.ID, err)
				}
				continue
			}

			err = downloadWithRetry(dl, streamURL, entryTMDBID, mediaInfo.Title, mediaInfo.Year, true, "", "", "", sftpConfig, debug)
			if err != nil {
				fmt.Printf("Failed to redownload movie: %v\n", err)
			}
		} else {
			totalSeasons, err := tmdbClient.GetTotalSeasons(entryTMDBID)
			if err != nil {
				fmt.Printf("Failed to get total seasons: %v\n", err)
				if err := queueManager.releaseEntry(entry.ID); err != nil {
					fmt.Printf("Failed to release entry %s: %v\n", entry.ID, err)
				}
				continue
			}

			for seasonNum := 1; seasonNum <= totalSeasons; seasonNum++ {
				seasonStr := strconv.Itoa(seasonNum)
				episodes, err := tmdbClient.GetSeasonInfo(entryTMDBID, seasonStr)
				if err != nil {
					log.Printf("Warning: Failed to get Season %d info: %v", seasonNum, err)
					continue
				}

				for _, ep := range episodes {
					epNum := strconv.Itoa(ep.EpisodeNumber)
					streamURL, err := streamClient.GetStreamByQuality(mediaInfo.IMDBId, "series", seasonStr, epNum, quality)
					if err != nil {
						fmt.Printf("Warning: No stream found for S%d E%d: %v\n", seasonNum, ep.EpisodeNumber, err)
						continue
					}

					err = downloadWithRetry(dl, streamURL, entryTMDBID, mediaInfo.Title, mediaInfo.Year, false, seasonStr, epNum, ep.Name, sftpConfig, debug)
					if err != nil {
						log.Printf("Failed to download S%d E%d: %v", seasonNum, ep.EpisodeNumber, err)
						continue
					}
				}
			}
		}

		if err := queueManager.releaseEntry(entry.ID); err != nil {
			fmt.Printf("Failed to release entry %s: %v\n", entry.ID, err)
		}
	}

	return nil
}

func addToQueue(mediaType, tmdbID string) error {
	queueManager := NewQueueManager("./queue.csv")

	entries, err := queueManager.readQueue()
	if err != nil {
		return fmt.Errorf("Warning: Failed to add to queue: %v", err)
	}

	id := fmt.Sprintf("%s-%s", mediaType, tmdbID)
	for _, entry := range entries {
		if entry.ID == id {
			return fmt.Errorf("entry %s already exists in queue", id)
		}
	}

	entries = append(entries, QueueEntry{
		ID:        id,
		StartTime: time.Time{},
	})

	return queueManager.writeQueue(entries)
}
