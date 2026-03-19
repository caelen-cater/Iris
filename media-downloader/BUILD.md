# Media Downloader - Build Instructions

## Building on Ubuntu x86_64

### Prerequisites
1. Install Go (version 1.21 or later):
```bash
# Download and install Go
wget https://go.dev/dl/go1.21.5.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.21.5.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
source ~/.bashrc
```

2. Verify Go installation:
```bash
go version
```

### Build Commands

1. **Clone/copy the project** to your Ubuntu machine

2. **Install dependencies**:
```bash
cd /path/to/media-downloader
go mod tidy
```

3. **Build the application**:

   **Option A: Use the build script (recommended)**:
   ```bash
   ./build.sh
   ```

   **Option B: Manual build commands**:
   ```bash
   # Static binary (recommended for distribution)
   CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o bin/media-downloader-static .
   
   # Regular binary
   go build -o bin/media-downloader .
   ```

### Output Files
- `bin/media-downloader-static` - Static binary (no dependencies, works on any Linux x86_64)
- `bin/media-downloader` - Regular binary (may require specific system libraries)

### Usage
```bash
# Make executable (if needed)
chmod +x bin/media-downloader-static

# Test the build
./bin/media-downloader-static --help

# Download a TV episode
./bin/media-downloader-static --tmdb-id 2190 --season 4 --episode 5 --rd-key YOUR_RD_KEY

# Download entire season
./bin/media-downloader-static --tmdb-id 2190 --season 4 --rd-key YOUR_RD_KEY

# Download movie
./bin/media-downloader-static --tmdb-id 550 --rd-key YOUR_RD_KEY
```

### Distribution
The `media-downloader-static` binary is self-contained and can be copied to any Linux x86_64 system without requiring Go or any other dependencies to be installed.

### Build Flags Explained
- `CGO_ENABLED=0` - Disables C bindings for a pure Go binary
- `GOOS=linux GOARCH=amd64` - Cross-compile for Linux x86_64
- `-ldflags="-s -w"` - Strip debug info to reduce binary size
  - `-s` - Omit symbol table and debug info
  - `-w` - Omit DWARF symbol table
