package tmdb

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

const (
	baseURL = "https://api.themoviedb.org/3"
	apiKey  = "YOUR_API_KEY"
)

type Client struct {
	httpClient *http.Client
}

type MediaInfo struct {
	Title  string
	Year   string
	IMDBId string
	TMDBID string
}

type MovieResponse struct {
	Title       string `json:"title"`
	ReleaseDate string `json:"release_date"`
	IMDBId      string `json:"imdb_id"`
}

type TVResponse struct {
	Name            string `json:"name"`
	FirstAirDate    string `json:"first_air_date"`
	NumberOfSeasons int    `json:"number_of_seasons"`
}

type ExternalIds struct {
	IMDBId string `json:"imdb_id"`
}

type EpisodeInfo struct {
	EpisodeNumber int    `json:"episode_number"`
	Name          string `json:"name"`
}

type SeasonResponse struct {
	Episodes []EpisodeInfo `json:"episodes"`
}

func NewClient() *Client {
	return &Client{
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *Client) makeRequest(url string, target interface{}) error {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}

	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("TMDB API error: %d", resp.StatusCode)
	}

	return json.NewDecoder(resp.Body).Decode(target)
}

func (c *Client) GetMediaInfo(tmdbID string, isMovie bool) (*MediaInfo, error) {
	if isMovie {
		return c.getMovieInfo(tmdbID)
	}
	return c.getTVInfo(tmdbID)
}

func (c *Client) getMovieInfo(tmdbID string) (*MediaInfo, error) {
	var movie MovieResponse
	url := fmt.Sprintf("%s/movie/%s", baseURL, tmdbID)

	if err := c.makeRequest(url, &movie); err != nil {
		return nil, err
	}

	year := ""
	if movie.ReleaseDate != "" {
		if t, err := time.Parse("2006-01-02", movie.ReleaseDate); err == nil {
			year = fmt.Sprintf(" (%d)", t.Year())
		}
	}

	return &MediaInfo{
		Title:  movie.Title + year,
		Year:   year,
		IMDBId: movie.IMDBId,
		TMDBID: tmdbID,
	}, nil
}

func (c *Client) getTVInfo(tmdbID string) (*MediaInfo, error) {
	var tv TVResponse
	url := fmt.Sprintf("%s/tv/%s", baseURL, tmdbID)

	if err := c.makeRequest(url, &tv); err != nil {
		return nil, err
	}

	var external ExternalIds
	externalURL := fmt.Sprintf("%s/tv/%s/external_ids", baseURL, tmdbID)
	if err := c.makeRequest(externalURL, &external); err != nil {
		return nil, fmt.Errorf("failed to get external IDs: %w", err)
	}

	year := ""
	if tv.FirstAirDate != "" {
		if t, err := time.Parse("2006-01-02", tv.FirstAirDate); err == nil {
			year = fmt.Sprintf("%d", t.Year())
		}
	}

	return &MediaInfo{
		Title:  tv.Name,
		Year:   year,
		IMDBId: external.IMDBId,
		TMDBID: tmdbID,
	}, nil
}

func (c *Client) GetSeasonInfo(tmdbID, season string) ([]EpisodeInfo, error) {
	var seasonResp SeasonResponse
	url := fmt.Sprintf("%s/tv/%s/season/%s", baseURL, tmdbID, season)

	if err := c.makeRequest(url, &seasonResp); err != nil {
		return nil, err
	}

	return seasonResp.Episodes, nil
}

func (c *Client) GetTotalSeasons(tmdbID string) (int, error) {
	var tv TVResponse
	url := fmt.Sprintf("%s/tv/%s", baseURL, tmdbID)

	if err := c.makeRequest(url, &tv); err != nil {
		return 0, err
	}

	return tv.NumberOfSeasons, nil
}
