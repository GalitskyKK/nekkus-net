package sitecheck

import (
	"context"
	"io"
	"net/http"
	"strings"
	"time"
)

// Site задаёт URL и отображаемое имя для проверки.
type Site struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}

// DefaultSites — список сайтов для проверки доступности (нейросети, поиск, стриминг).
var DefaultSites = []Site{
	{Name: "ChatGPT", URL: "https://chat.openai.com"},
	{Name: "Gemini", URL: "https://gemini.google.com"},
	{Name: "Claude", URL: "https://claude.ai"},
	{Name: "Google", URL: "https://www.google.com"},
	{Name: "YouTube", URL: "https://www.youtube.com"},
	{Name: "Netflix", URL: "https://www.netflix.com"},
}

// Result — результат проверки одного сайта.
type Result struct {
	Name     string `json:"name"`
	URL      string `json:"url"`
	OK       bool   `json:"ok"`
	LatencyMs int64  `json:"latency_ms,omitempty"`
	Error    string `json:"error,omitempty"`
}

// Check выполняет проверку списка сайтов через клиент (с учётом системного прокси, если VPN включён).
// timeout — таймаут на один запрос; client может быть nil — тогда создаётся default с timeout.
func Check(ctx context.Context, client *http.Client, sites []Site, timeout time.Duration) []Result {
	if client == nil {
		client = &http.Client{
			Timeout: timeout,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				return http.ErrUseLastResponse
			},
		}
	}
	results := make([]Result, 0, len(sites))
	for _, site := range sites {
		r := checkOne(ctx, client, site, timeout)
		results = append(results, r)
	}
	return results
}

// Фразы в теле ответа, по которым считаем, что сайт недоступен (гео-блок, заглушка).
var blockPhrases = []string{
	"isn't available",
	"not available in your",
	"not available in this",
	"service is not available",
	"service isn't available",
	"unavailable in your",
	"unavailable in this",
	"access restricted",
	"доступ ограничен",
	"недоступен",
	"не доступен",
	"в вашем регионе",
	"в этой стране",
	"georestrict",
	"blocked in your",
	"blocked in this",
	"sorry, we're having trouble",
	"this service is not available",
	"not available in your country",
	"not available in your region",
	"content is not available",
	"video unavailable",
	"redirected you too many times",
	"connection refused",
	"check your connection",
	"something went wrong",
	"error code",
	"попробуйте позже",
	"временно недоступен",
}

const maxBodyCheck = 128 * 1024 // проверяем первые 128 KB
const minBodySize = 2000        // ответ короче — скорее заглушка/редирект на блок

// CheckOne проверяет один сайт. Используется для проверки по одному из API.
func CheckOne(ctx context.Context, client *http.Client, site Site, timeout time.Duration) Result {
	return checkOne(ctx, client, site, timeout)
}

// SiteByURL или по имени возвращает сайт из DefaultSites или nil.
func SiteByURL(url string) *Site {
	for i := range DefaultSites {
		if DefaultSites[i].URL == url {
			return &DefaultSites[i]
		}
	}
	return nil
}

// SiteByName возвращает сайт из DefaultSites по имени (без учёта регистра) или nil.
func SiteByName(name string) *Site {
	lower := strings.ToLower(name)
	for i := range DefaultSites {
		if strings.ToLower(DefaultSites[i].Name) == lower {
			return &DefaultSites[i]
		}
	}
	return nil
}

func checkOne(ctx context.Context, client *http.Client, site Site, timeout time.Duration) Result {
	start := time.Now()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, site.URL, nil)
	if err != nil {
		return Result{Name: site.Name, URL: site.URL, OK: false, Error: err.Error()}
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; rv:131.0) Gecko/20100101 Firefox/131.0")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	resp, err := client.Do(req)
	elapsed := time.Since(start).Milliseconds()
	if err != nil {
		return Result{Name: site.Name, URL: site.URL, OK: false, LatencyMs: elapsed, Error: err.Error()}
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 400 {
		return Result{
			Name: site.Name, URL: site.URL, OK: false, LatencyMs: elapsed,
			Error: "HTTP " + resp.Status,
		}
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxBodyCheck))
	if err != nil {
		return Result{Name: site.Name, URL: site.URL, OK: false, LatencyMs: elapsed, Error: err.Error()}
	}
	if len(body) < minBodySize {
		return Result{
			Name: site.Name, URL: site.URL, OK: false, LatencyMs: elapsed,
			Error: "недоступен (слишком короткий ответ, возможно заглушка)",
		}
	}
	bodyStr := strings.ToLower(string(body))
	for _, phrase := range blockPhrases {
		if strings.Contains(bodyStr, phrase) {
			return Result{
				Name: site.Name, URL: site.URL, OK: false, LatencyMs: elapsed,
				Error: "недоступен (блок по региону или заглушка)",
			}
		}
	}
	return Result{Name: site.Name, URL: site.URL, OK: true, LatencyMs: elapsed}
}
