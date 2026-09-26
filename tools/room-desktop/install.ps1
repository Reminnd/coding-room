param([string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path)
$ErrorActionPreference = 'Stop'
$repository = [System.IO.Path]::GetFullPath($RepositoryRoot)
$cargo = Join-Path $env:USERPROFILE '.cargo/bin/cargo.exe'
if (-not (Test-Path -LiteralPath $cargo)) { throw 'Install Rust with the MSVC toolchain before building Room desktop.' }
$node = (Get-Command node.exe -ErrorAction Stop).Source
Push-Location -LiteralPath $repository
try {
  npm ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'Room dependency installation failed.' }
  npm --prefix frontend ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
  npm --prefix frontend run build
  if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
  & $cargo build --release --locked --manifest-path desktop/src-tauri/Cargo.toml
  if ($LASTEXITCODE -ne 0) { throw 'Desktop build failed.' }
  $destination = Join-Path $repository '.agent-room/desktop'
  New-Item -ItemType Directory -Path $destination -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $repository 'desktop/src-tauri/target/release/room-desktop.exe') -Destination (Join-Path $destination 'Room.exe')
  $launcherJson = @{repository_root=$repository;node_executable=$node} | ConvertTo-Json
  [System.IO.File]::WriteAllText((Join-Path $destination 'room-launcher.json'), $launcherJson, [System.Text.UTF8Encoding]::new($false))
  $skill = Join-Path $env:USERPROFILE '.codex/skills/room-ui'
  New-Item -ItemType Directory -Path $skill -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $repository 'integrations/codex/room-ui/SKILL.md') -Destination (Join-Path $skill 'SKILL.md')
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Room.lnk'))
  $shortcut.TargetPath = Join-Path $destination 'Room.exe'
  $shortcut.WorkingDirectory = $repository
  $shortcut.Description = 'Open Agent Room in Codex'
  $shortcut.Save()
  Write-Output ('Room installed: ' + $shortcut.TargetPath)
} finally { Pop-Location }
