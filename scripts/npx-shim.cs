// Windows için npx.exe kabuğu (yalnız test koşucusu kullanır; scripts/test-all.mjs derler).
// Python testleri Popen(['npx', 'vite', ...]) ile kabuksuz başlatır; Windows yalnız npx.exe'yi çözer. "vite ..." doğrudan node ile
// vite.js'e yönlendirilir; diğer komutlar npx.cmd'ye. Alt süreç, bu süreç öldürülünce (Popen.terminate) job nesnesiyle birlikte ölür.
using System; using System.Diagnostics; using System.Runtime.InteropServices; using System.Text;
class NpxShim {
  [DllImport("kernel32.dll")] static extern IntPtr CreateJobObject(IntPtr a, string n);
  [DllImport("kernel32.dll")] static extern bool SetInformationJobObject(IntPtr j, int c, IntPtr p, uint l);
  [DllImport("kernel32.dll")] static extern bool AssignProcessToJobObject(IntPtr j, IntPtr p);
  static string Q(string a) { return (a.Length > 0 && a.IndexOfAny(new[] { ' ', '\t', '"' }) < 0) ? a : "\"" + a.Replace("\"", "\\\"") + "\""; }
  static int Main(string[] args) {
    IntPtr job = CreateJobObject(IntPtr.Zero, null);
    IntPtr info = Marshal.AllocHGlobal(144);
    for (int i = 0; i < 144; i++) Marshal.WriteByte(info, i, 0);
    Marshal.WriteInt32(info, 16, 0x2000); // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    SetInformationJobObject(job, 9, info, 144);
    var psi = new ProcessStartInfo { UseShellExecute = false };
    string node = Environment.GetEnvironmentVariable("MIHENK_NODE"), vite = Environment.GetEnvironmentVariable("MIHENK_VITE");
    var sb = new StringBuilder();
    if (args.Length > 0 && args[0] == "vite" && !string.IsNullOrEmpty(node) && !string.IsNullOrEmpty(vite)) {
      psi.FileName = node; sb.Append(Q(vite));
      for (int i = 1; i < args.Length; i++) sb.Append(' ').Append(Q(args[i]));
    } else {
      psi.FileName = "cmd.exe"; sb.Append("/c npx.cmd");
      foreach (var a in args) sb.Append(' ').Append(Q(a));
    }
    psi.Arguments = sb.ToString();
    var p = Process.Start(psi);
    AssignProcessToJobObject(job, p.Handle);
    p.WaitForExit();
    return p.ExitCode;
  }
}
