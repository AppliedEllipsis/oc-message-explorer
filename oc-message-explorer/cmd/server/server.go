package server

import (
	"context"
	"flag"
	"fmt"
	"log"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/gorilla/mux"

	"oc-message-explorer/internal/utils"
)

func Run() {
	var noBrowser bool
	flag.BoolVar(&noBrowser, "no-browser", false, "Disable automatic browser opening")
	flag.Parse()

	slog.Info("Starting OC Message Explorer server")

	store := NewStore()
	exeDir := utils.GetExecutableDir()
	staticDir := filepath.Join(exeDir, "static")

	slog.Info("Static files", "directory", staticDir)

	router := mux.NewRouter()

	router.PathPrefix("/static/").Handler(http.StripPrefix("/static/", http.FileServer(http.Dir(staticDir))))
	setupRoutes(router, store, exeDir)

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		slog.Error("Failed to listen", "error", err)
		log.Fatal(err)
	}

	port := listener.Addr().(*net.TCPAddr).Port
	url := fmt.Sprintf("http://127.0.0.1:%d", port)
	slog.Info("Server listening", "url", url, "port", port)

	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("  OC Message Explorer")
	fmt.Println(strings.Repeat("=", 60))
	fmt.Printf("\n  %s\n\n", url)
	fmt.Println("  Press Ctrl+C to quit")
	fmt.Println("\n" + strings.Repeat("=", 60) + "\n")

	srv := &http.Server{
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	serverErrors := make(chan error, 1)

	go func() {
		if err := srv.Serve(listener); err != nil && err != http.ErrServerClosed {
			slog.Error("Server error", "error", err)
			serverErrors <- err
		}
	}()

	if !noBrowser {
		go func() {
			time.Sleep(500 * time.Millisecond)
			utils.OpenBrowser(url)
		}()
	}

	shutdownChan := make(chan os.Signal, 1)
	signal.Notify(shutdownChan, os.Interrupt, syscall.SIGTERM)

	slog.Info("Server running, waiting for shutdown signal")

	select {
	case err := <-serverErrors:
		slog.Error("Fatal server error", "error", err)
	case <-shutdownChan:
		slog.Info("Shutdown signal received")
		fmt.Printf("\nShutting down...\n")
		slog.Info("Starting graceful shutdown")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("Server shutdown error", "error", err)
	}

	fmt.Println("\nServer stopped gracefully")
	slog.Info("Server stopped")
}

type Store interface {
	readAgentsContent() string
}

type SimpleStore struct{}

func NewStore() *SimpleStore {
	return &SimpleStore{}
}

func (s *SimpleStore) readAgentsContent() string {
	agentsPath := utils.GetProjectRoot()

	paths := []string{
		filepath.Join(agentsPath, "AGENTS.md"),
		filepath.Join(agentsPath, "agents.md"),
		filepath.Join(agentsPath, "docs", "AGENTS.md"),
	}

	for _, path := range paths {
		if content, err := os.ReadFile(path); err == nil {
			return string(content)
		}
	}

	return "# No AGENTS.md file found"
}

func setupRoutes(router *mux.Router, store Store, exeDir string) {
	router.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		indexPath := filepath.Join(exeDir, "static", "index.html")
		http.ServeFile(w, r, indexPath)
	})

	router.HandleFunc("/favicon.ico", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})

	router.HandleFunc("/api/agents-content", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" {
			respondJSON(w, map[string]string{"content": store.readAgentsContent()})
		}
	})
}

func respondJSON(w http.ResponseWriter, data any) {
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprint(w, asJSON(data))
}

func respondError(w http.ResponseWriter, code int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	fmt.Fprint(w, asJSON(map[string]string{"error": message}))
}

func asJSON(v any) string {
	b, err := utils.JSONMarshal(v)
	if err != nil {
		return "{}"
	}
	return string(b)
}
