package serversource

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Client struct {
	rdKey      string
	baseURL    string
	httpClient *http.Client
}

type Stream struct {
	Name  string `json:"name"`
	Title string `json:"title"`
	URL   string `json:"url"`
}

type Response struct {
	Streams []Stream `json:"streams"`
}

func NewClient(rdKey, baseURL string) *Client {
	return &Client{
		rdKey:      rdKey,
		baseURL:    baseURL,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *Client) GetStreamByQuality(imdbID, mediaType, season, episode, quality string) (string, error) {
	streams, err := c.getAllStreams(imdbID, mediaType, season, episode)
	if err != nil {
		return "", err
	}

	if len(streams) == 0 {
		return "", fmt.Errorf("no streams available")
	}

	for _, stream := range streams {
		if quality != "" && strings.Contains(strings.ToLower(stream.Title), strings.ToLower(quality)) {
			return stream.URL, nil
		}
	}

	return streams[0].URL, nil
}

func (c *Client) GetStreamByQualityFallback(imdbID, mediaType, season, episode string) (string, error) {
	streams, err := c.getAllStreams(imdbID, mediaType, season, episode)
	if err != nil {
		return "", err
	}

	if len(streams) == 0 {
		return "", fmt.Errorf("no streams available")
	}

	return streams[0].URL, nil
}

func (c *Client) getAllStreams(imdbID, mediaType, season, episode string) ([]Stream, error) {
	var streamID string
	if mediaType == "movie" {
		streamID = imdbID
	} else {
		streamID = fmt.Sprintf("%s:%s:%s", imdbID, season, episode)
	}

	url := fmt.Sprintf("%s/realdebrid=%s/stream/%s/%s.json",
		c.baseURL, c.rdKey, mediaType, streamID)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "application/json,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.5")
	req.Header.Set("DNT", "1")
	req.Header.Set("Connection", "keep-alive")
	req.Header.Set("Upgrade-Insecure-Requests", "1")

	time.Sleep(time.Duration(2+time.Now().UnixNano()%3) * time.Second)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode == 403 {
		return nil, fmt.Errorf("blocked by Cloudflare - try again later or use a different IP")
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("stream not available (%d) - Response: %s", resp.StatusCode, string(body))
	}

	var streamResp Response
	if err := json.Unmarshal(body, &streamResp); err != nil {
		return nil, fmt.Errorf("failed to parse JSON: %w - Response: %s", err, string(body))
	}

	return streamResp.Streams, nil
}
