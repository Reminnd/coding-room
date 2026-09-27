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
  & $cargo build --release --locked -j 2 --manifest-path desktop/src-tauri/Cargo.toml
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
  $hostInfo = (& (Join-Path $PSScriptRoot 'codex-host.ps1') -Action inspect) | ConvertFrom-Json
  if (-not $hostInfo.executable) { throw 'Install Codex before installing its Room integration.' }
  $shortcutPaths = @(
    (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Codex.lnk'),
    (Join-Path ([Environment]::GetFolderPath('Programs')) 'Codex.lnk')
  )
  $pinnedRoot = Join-Path $env:APPDATA 'Microsoft/Internet Explorer/Quick Launch/User Pinned/TaskBar'
  if (Test-Path -LiteralPath $pinnedRoot) {
    $shortcutPaths += @(Get-ChildItem -LiteralPath $pinnedRoot -Filter '*.lnk' | Where-Object {
      $target = $shell.CreateShortcut($_.FullName).TargetPath
      $target -eq $hostInfo.executable -or $target -eq (Join-Path $destination 'Room.exe')
    } | ForEach-Object { $_.FullName })
  }
  foreach ($shortcutPath in $shortcutPaths) {
    if ((Test-Path -LiteralPath $shortcutPath) -and -not (Test-Path -LiteralPath ($shortcutPath + '.room-backup'))) {
      Copy-Item -LiteralPath $shortcutPath -Destination ($shortcutPath + '.room-backup')
    }
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = Join-Path $destination 'Room.exe'
    $shortcut.Arguments = '--codex'
    $shortcut.WorkingDirectory = $repository
    $shortcut.IconLocation = $hostInfo.executable + ',0'
    $shortcut.Description = 'Codex with Room'
    $shortcut.Save()
    & (Join-Path $PSScriptRoot 'taskbar.ps1') -Shortcut $shortcutPath
  }
  $oldShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Room.lnk'
  if ((Test-Path -LiteralPath $oldShortcut) -and $shell.CreateShortcut($oldShortcut).TargetPath -eq (Join-Path $destination 'Room.exe')) {
    Move-Item -LiteralPath $oldShortcut -Destination (Join-Path $destination 'Room.lnk.previous') -Force
  }
  Write-Output ('Codex startup integration installed: ' + $shortcutPaths[0])
} finally { Pop-Location }
