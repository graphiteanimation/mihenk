# Windows: verilen süreçte açılan ortak "Farklı kaydet / Aç" diyaloğunu bulur, dosya yolunu yazar ve Enter'a basar.
# Kullanım: powershell -File win-dialog-type.ps1 -ProcId 1234 -Path C:\x\cikti.nc [-TimeoutSec 40]
# Çıkış kodu: 0 = gönderildi, 2 = diyalog zaman aşımına uğradı.
param([int]$ProcId, [string]$Path, [int]$TimeoutSec = 40)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName Microsoft.VisualBasic
Add-Type @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class DlgFind {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr h, EnumProc p, IntPtr l);
  [DllImport("user32.dll")] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  public static IntPtr Find(uint pid) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => {
      uint p; GetWindowThreadProcessId(h, out p);
      if (p == pid && IsWindowVisible(h)) { var sb = new StringBuilder(64); GetClassName(h, sb, 64); if (sb.ToString() == "#32770") { found = h; return false; } }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@
$deadline = (Get-Date).AddSeconds($TimeoutSec)
$h = [IntPtr]::Zero
while ((Get-Date) -lt $deadline) { $h = [DlgFind]::Find([uint32]$ProcId); if ($h -ne [IntPtr]::Zero) { break }; Start-Sleep -Milliseconds 300 }
if ($h -eq [IntPtr]::Zero) { Write-Output 'diyalog bulunamadi'; exit 2 }
Start-Sleep -Milliseconds 800
[void][DlgFind]::SetForegroundWindow($h)
Start-Sleep -Milliseconds 400
# SendKeys özel karakterleri ({ } + ^ % ~ ( )) yolda olmamalı; kaçışla
$esc = [regex]::Replace($Path, '[{}+^%~()\[\]]', { param($m) '{' + $m.Value + '}' })
[System.Windows.Forms.SendKeys]::SendWait($esc)
Start-Sleep -Milliseconds 400
[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
Write-Output 'gonderildi'
exit 0
