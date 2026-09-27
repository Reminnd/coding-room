param([ValidateSet('inspect','activate')][string]$Action = 'inspect', [int]$ProcessId = 0)
$ErrorActionPreference = 'Stop'
$profilePath = Join-Path $env:APPDATA 'Codex/web/Codex'
if ($Action -eq 'inspect') {
  $processes = @(Get-CimInstance Win32_Process -Filter "Name = 'ChatGPT.exe'" | Where-Object { $_.CommandLine -notmatch '--type=' -and $_.ExecutablePath -match 'OpenAI.Codex_' } | ForEach-Object {
    $profile = $profilePath
    if ($_.CommandLine -match '--user-data-dir=(?:"([^"]+)"|(\S+))') { $profile = if ($Matches[1]) { $Matches[1] } else { $Matches[2] } }
    $port = $null
    if ($_.CommandLine -match '--remote-debugging-port=(\d+)') { $port = [int]$Matches[1] }
    [pscustomobject]@{pid=$_.ProcessId;executable=$_.ExecutablePath;profile=[IO.Path]::GetFullPath($profile);port=$port}
  })
  $installed = Get-AppxPackage OpenAI.Codex | Select-Object -First 1
  $executable = if ($installed) { Join-Path $installed.InstallLocation 'app/ChatGPT.exe' } elseif ($processes.Count) { $processes[0].executable } else { $null }
  @{executable=$executable;profile=[IO.Path]::GetFullPath($profilePath);processes=$processes} | ConvertTo-Json -Depth 4 -Compress
  exit
}
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class CodexWindow {
 public delegate bool Callback(IntPtr h, IntPtr p);
 [DllImport("user32.dll")] public static extern bool EnumWindows(Callback c,IntPtr p);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h,int index);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int command);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [StructLayout(LayoutKind.Sequential)] public struct RECT {public int Left,Top,Right,Bottom;}
}
'@
$windows = [Collections.Generic.List[object]]::new()
[CodexWindow]::EnumWindows({param($handle,$unused)
  $owner=0
  [CodexWindow]::GetWindowThreadProcessId($handle,[ref]$owner) | Out-Null
  if ($owner -eq $ProcessId) {
    $title=[Text.StringBuilder]::new(512)
    [CodexWindow]::GetWindowText($handle,$title,512) | Out-Null
    $rect=New-Object CodexWindow+RECT
    [CodexWindow]::GetWindowRect($handle,[ref]$rect) | Out-Null
    if ($title.ToString() -eq 'ChatGPT' -and ([CodexWindow]::GetWindowLong($handle,-20) -band 0x80) -eq 0) {
      $windows.Add([pscustomobject]@{handle=$handle;width=$rect.Right-$rect.Left})
    }
  }
  return $true
},[IntPtr]::Zero) | Out-Null
$window = $windows | Sort-Object width -Descending | Select-Object -First 1
if ($window) {
  $launcher = Join-Path $PSScriptRoot '../../.agent-room/desktop/Room.exe'
  if (Test-Path -LiteralPath $launcher) {
    & (Join-Path $PSScriptRoot 'taskbar.ps1') -WindowHandle $window.handle.ToInt64() -Launcher ([IO.Path]::GetFullPath($launcher)) -Icon (Get-Process -Id $ProcessId).Path
  }
  [CodexWindow]::ShowWindow($window.handle,9) | Out-Null
  [CodexWindow]::SetForegroundWindow($window.handle) | Out-Null
}
@{shown=[bool]$window} | ConvertTo-Json -Compress
