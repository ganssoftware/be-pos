# ==========================================
# BE-POS - Git Push
# ==========================================

$ErrorActionPreference = "Stop"

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " BE-POS - Git Push" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

# ==========================================
# Git Identity
# ==========================================

git config user.name "ganssoftware"
git config user.email "ganssoftware1@gmail.com"

Write-Host ""
Write-Host "Git User : ganssoftware" -ForegroundColor Green
Write-Host "Git Email: ganssoftware1@gmail.com" -ForegroundColor Green

# ==========================================
# Initialize Git
# ==========================================

Write-Host ""
Write-Host "Initializing Git..." -ForegroundColor Cyan

if (-not (Test-Path ".git")) {
    git init
    Write-Host "Git repository berhasil dibuat." -ForegroundColor Green
}
else {
    Write-Host "Git repository sudah tersedia." -ForegroundColor Yellow
}

# ==========================================
# README
# ==========================================

if (-not (Test-Path "README.md")) {
    "# be-pos" | Out-File -Encoding utf8 "README.md"
    Write-Host "README.md dibuat." -ForegroundColor Yellow
}

# ==========================================
# Branch
# ==========================================

git branch -M main

# ==========================================
# Remote Repository
# ==========================================

$remoteUrl = "https://github.com/ganssoftware/be-pos.git"

$remotes = @(git remote)

if ($remotes -contains "origin") {
    git remote set-url origin $remoteUrl
    Write-Host "Remote origin diperbarui." -ForegroundColor Green
}
else {
    git remote add origin $remoteUrl
    Write-Host "Remote origin ditambahkan." -ForegroundColor Green
}

# ==========================================
# Add Files
# ==========================================

Write-Host ""
Write-Host "Menambahkan file..." -ForegroundColor Cyan

git add .

# ==========================================
# Commit
# ==========================================

Write-Host ""
Write-Host "Membuat commit..." -ForegroundColor Cyan

$changes = git diff --cached --name-only

if ($changes) {
    git commit -m "Update User API v.1.0.0"
    Write-Host "Commit berhasil dibuat." -ForegroundColor Green
}
else {
    Write-Host "Tidak ada perubahan baru untuk di-commit." -ForegroundColor Yellow
}

# ==========================================
# Push
# ==========================================

Write-Host ""
Write-Host "Push ke GitHub..." -ForegroundColor Cyan

git push -u origin main

# ==========================================
# Finish
# ==========================================

Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host " Push ke GitHub berhasil!" -ForegroundColor Green
Write-Host " Branch: main" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green