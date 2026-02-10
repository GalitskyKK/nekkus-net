package main

import (
	"embed"
	_ "embed"
	"flag"
	"log"
	"os"
	"strings"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// Wails uses Go's `embed` package to embed the frontend files into the binary.
// Any files in the frontend/dist folder will be embedded into the binary and
// made available to the frontend.
// See https://pkg.go.dev/embed for more information.

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	mode := flag.String("mode", "standalone", "Run mode: standalone or hub")
	showUI := flag.Bool("ui", false, "Show UI in hub mode")
	listenAddr := flag.String("addr", defaultListenAddr, "gRPC listen address")
	httpAddr := flag.String("http-addr", defaultHTTPAddr, "Standalone HTTP address")
	dataDir := flag.String("data-dir", defaultDataDir, "Data directory")
	hubAddr := flag.String("hub-addr", os.Getenv("NEKKUS_HUB_ADDR"), "Hub gRPC address")
	moduleID := flag.String("module-id", defaultModuleID, "Module identifier")
	version := flag.String("version", defaultVersion, "Module version")
	flag.Parse()

	if !*showUI {
		*showUI = shouldShowUIFromEnv()
	}

	if *mode == "hub" {
		if *showUI {
			clearDevServerEnv()
			_ = os.Setenv("WAILS_ENV", "production")
			_ = os.Setenv("WAILS_DEV_SERVER_URL", "")
			_ = os.Setenv("WAILS_VITE_DEV_SERVER_URL", "")
			_ = os.Setenv("WAILS_DEVSERVER_URL", "")
			_ = os.Setenv("VITE_DEV_SERVER_URL", "")
		}
		startHTTP := *showUI
		grpcServer, err := RunBackend(BackendOptions{
			Mode:      "hub",
			GRPCAddr:  *listenAddr,
			HTTPAddr:  *httpAddr,
			DataDir:   *dataDir,
			HubAddr:   *hubAddr,
			ModuleID:  *moduleID,
			Version:   *version,
			StartHTTP: startHTTP,
		})
		if err != nil {
			log.Fatal(err)
		}
		if *showUI {
			go waitForShutdown(grpcServer)
			runWailsUI()
			grpcServer.GracefulStop()
			return
		}
		waitForShutdown(grpcServer)
		return
	}

	_, err := RunBackend(BackendOptions{
		Mode:      "standalone",
		GRPCAddr:  *listenAddr,
		HTTPAddr:  *httpAddr,
		DataDir:   *dataDir,
		HubAddr:   *hubAddr,
		ModuleID:  *moduleID,
		Version:   *version,
		StartHTTP: true,
	})
	if err != nil {
		log.Fatal(err)
	}

	runWailsUI()
}

func runWailsUI() {
	app := application.New(application.Options{
		Name:        "nekkus VPN",
		Description: "nekkus VPN standalone module",
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	// Create a new window with the necessary options.
	// 'Title' is the title of the window.
	// 'Mac' options tailor the window when running on macOS.
	// 'BackgroundColour' is the background colour of the window.
	// 'URL' is the URL that will be loaded into the webview.
	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title: "nekkus VPN",
		URL:   "/",
	})
	window.OnWindowEvent(events.Common.WindowClosing, func(_ *application.WindowEvent) {
		app.Quit()
	})

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}

func shouldShowUIFromEnv() bool {
	value := strings.TrimSpace(strings.ToLower(os.Getenv("NEKKUS_SHOW_UI")))
	if value == "" {
		return false
	}
	return value == "1" || value == "true" || value == "yes" || value == "on"
}

func clearDevServerEnv() {
	for _, entry := range os.Environ() {
		key := strings.SplitN(entry, "=", 2)[0]
		if strings.HasPrefix(key, "WAILS") || strings.HasPrefix(key, "VITE") {
			_ = os.Unsetenv(key)
		}
	}
}
