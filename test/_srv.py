# Arayüz testleri için ortak sunucu yardımcısı: her koşu KENDİ boş portunda KENDİ vite sunucusunu açar ve kapatır.
# Açık kalmış (başka koşunun, başka ajanın) sunucusu yeniden kullanılmaz; port sabit değildir (işletim sistemi boş port verir).
# Kullanım: PORT, server = start(ROOT, ['preview']) ... finally: stop(server)
import os, signal, socket, subprocess, sys, time

def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p

def port_open(port):
    s = socket.socket(); s.settimeout(0.3)
    try: s.connect(('127.0.0.1', port)); return True
    except OSError: return False
    finally: s.close()

def start(root, vite_args, timeout=60):
    """vite'ı boş bir portta başlatır; (port, süreç) döner. Hazır olmazsa süreci kapatıp hata verir."""
    port = free_port()
    kw = {} if os.name == 'nt' else {'start_new_session': True}
    proc = subprocess.Popen(['npx', 'vite', *vite_args, '--port', str(port), '--strictPort'], cwd=root, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **kw)
    t0 = time.time()
    while time.time() - t0 < timeout:
        if proc.poll() is not None: raise RuntimeError(f'vite {port} portunda başlamadı (çıkış kodu {proc.returncode})')
        if port_open(port): return port, proc
        time.sleep(0.2)
    stop(proc); raise RuntimeError(f'vite {port} portunda {timeout} sn içinde hazır olmadı')

def stop(proc):
    """Sunucuyu (npx altındaki vite dahil süreç grubunu) kapatır."""
    if not proc or proc.poll() is not None: return
    try:
        if os.name == 'nt': proc.terminate()
        else: os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        proc.wait(timeout=10)
    except Exception:
        try:
            if os.name != 'nt': os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
            else: proc.kill()
        except Exception: pass
