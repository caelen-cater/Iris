#!/bin/bash

set -e

echo "Building media-downloader..."

# linux x86_64
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o bin/media-downloader-static .

# standard build
go build -o bin/media-downloader .

echo "To use:"
echo "  ./bin/media-downloader-static --tmdb-id 2190 --season 4 --episode 5 --rd-key YOUR_KEY"
