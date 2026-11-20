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
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  // pids: bu süreçlerden birine ait görünür "#32770" penceresi; yoksa ve any=true ise sistemdeki herhangi bir görünür "#32770"
  public static IntPtr Find(uint[] pids, bool any) {
    IntPtr found = IntPtr.Zero, anyFound = IntPtr.Zero;
    EnumWindows((h, l) => {
      uint p; GetWindowThreadProcessId(h, out p);
      if (!IsWindowVisible(h)) return true;
      var sb = new StringBuilder(64); GetClassName(h, sb, 64);
      if (sb.ToString() != "#32770") return true;
      if (Array.IndexOf(pids, p) >= 0) { found = h; return false; }
      if (anyFound == IntPtr.Zero) anyFound = h;
      return true;
    }, IntPtr.Zero);
    return found != IntPtr.Zero ? found : (any ? anyFound : IntPtr.Zero);
  }
  public static string Dump() {
    var res = new StringBuilder();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      uint p; GetWindowThreadProcessId(h, out p);
      var c = new StringBuilder(64); GetClassName(h, c, 64); var t = new StringBuilder(128); GetWindowText(h, t, 128);
      res.AppendLine("pid=" + p + " sinif=" + c + " baslik=" + t);
      return true;
    }, IntPtr.Zero);
    return res.ToString();
  }
}
"@
# süreç ağacı: Chromium diyaloğu ana süreçte ya da bir alt süreçte açabilir
$all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId
$tree = New-Object System.Collections.Generic.List[uint32]; $tree.Add([uint32]$ProcId)
for ($i = 0; $i -lt $tree.Count; $i++) { foreach ($c in $all) { if ($c.ParentProcessId -eq $tree[$i] -and -not $tree.Contains([uint32]$c.ProcessId)) { $tree.Add([uint32]$c.ProcessId) } } }
$pids = $tree.ToArray()
$deadline = (Get-Date).AddSeconds($TimeoutSec)
$h = [IntPtr]::Zero
while ((Get-Date) -lt $deadline) { $h = [DlgFind]::Find($pids, $true); if ($h -ne [IntPtr]::Zero) { break }; Start-Sleep -Milliseconds 300 }
if ($h -eq [IntPtr]::Zero) { Write-Output 'diyalog bulunamadi; surec agaci: ' ; Write-Output ($pids -join ','); Write-Output ([DlgFind]::Dump()); exit 2 }
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
