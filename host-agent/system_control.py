import socket
import time
import winreg

import psutil

_BOOT_TIME = psutil.boot_time()
psutil.cpu_percent(interval=None)
psutil.cpu_percent(interval=None, percpu=True)  # prime both baselines

_prev_disk = psutil.disk_io_counters()
_prev_net = psutil.net_io_counters()
_prev_time = time.time()


def _cpu_name() -> str:
    try:
        key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0")
        name = winreg.QueryValueEx(key, "ProcessorNameString")[0]
        return " ".join(name.replace("(TM)", "").replace("(R)", "").split())
    except Exception:
        return "CPU"


CPU_NAME = _cpu_name()

try:
    import pynvml

    pynvml.nvmlInit()
    _gpu = pynvml.nvmlDeviceGetHandleByIndex(0)
    GPU_NAME = pynvml.nvmlDeviceGetName(_gpu)
    if isinstance(GPU_NAME, bytes):
        GPU_NAME = GPU_NAME.decode()
    GPU_NAME = GPU_NAME.replace("NVIDIA ", "")
except Exception:
    _gpu = None
    GPU_NAME = None


def _gpu_stats() -> dict | None:
    # NVML is an in-process library call: cheap enough to read every tick,
    # unlike the old nvidia-smi subprocess.
    if _gpu is None:
        return None
    try:
        mem = pynvml.nvmlDeviceGetMemoryInfo(_gpu)
        stats = {
            "util": pynvml.nvmlDeviceGetUtilizationRates(_gpu).gpu,
            "temp": pynvml.nvmlDeviceGetTemperature(_gpu, pynvml.NVML_TEMPERATURE_GPU),
            "power": round(pynvml.nvmlDeviceGetPowerUsage(_gpu) / 1000, 1),
            "power_limit": round(pynvml.nvmlDeviceGetEnforcedPowerLimit(_gpu) / 1000),
            "vram_used": round(mem.used / 2**30, 1),
            "vram_total": round(mem.total / 2**30, 1),
        }
        try:
            stats["fan"] = pynvml.nvmlDeviceGetFanSpeed(_gpu)
        except Exception:
            stats["fan"] = None
        return stats
    except Exception:
        return None


def get_system_stats() -> dict:
    global _prev_disk, _prev_net, _prev_time

    now = time.time()
    elapsed = max(now - _prev_time, 0.001)
    disk_io = psutil.disk_io_counters()
    net_io = psutil.net_io_counters()
    disk_mbps = ((disk_io.read_bytes + disk_io.write_bytes) - (_prev_disk.read_bytes + _prev_disk.write_bytes)) / elapsed / 2**20
    net_mbps = ((net_io.bytes_sent + net_io.bytes_recv) - (_prev_net.bytes_sent + _prev_net.bytes_recv)) / elapsed / 2**20 * 8
    _prev_disk, _prev_net, _prev_time = disk_io, net_io, now

    vm = psutil.virtual_memory()
    gpu = _gpu_stats()
    return {
        "cpu": psutil.cpu_percent(interval=None),
        "cores": psutil.cpu_percent(interval=None, percpu=True),
        "cpu_name": CPU_NAME,
        "ram": vm.percent,
        "ram_used": round(vm.used / 2**30, 1),
        "ram_total": round(vm.total / 2**30),
        "disk": psutil.disk_usage("C:\\").percent,
        "disk_activity_mbps": round(max(disk_mbps, 0), 2),
        "network_mbps": round(max(net_mbps, 0), 2),
        "gpu": gpu["util"] if gpu else None,
        "gpu_mem_percent": round(gpu["vram_used"] / gpu["vram_total"] * 100, 1) if gpu else None,
        "gpu_detail": gpu,
        "gpu_name": GPU_NAME,
        "hostname": socket.gethostname(),
        "uptime_seconds": int(now - _BOOT_TIME),
        "processes": len(psutil.pids()),
    }
