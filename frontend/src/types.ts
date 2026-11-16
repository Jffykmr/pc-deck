export interface AppDef {
  id: string;
  label: string;
  exe: string;
  subtitle?: string;
  icon?: string;
  color?: string;
  args?: string[];
}

export interface Command {
  id: string;
  label: string;
  subtitle?: string;
  icon?: string;
  keys: string;
  press_enter?: boolean;
}

export interface Profile {
  label: string;
  color?: string;
  commands: Command[];
}

export interface Shortcut {
  id: string;
  label: string;
  hint?: string;
  icon?: string;
  keys?: string;
  exe?: string;
}

export interface Config {
  apps: AppDef[];
  profiles: Record<string, Profile>;
  shortcuts?: Shortcut[];
  notes?: string;
}

export interface WindowInfo {
  hwnd: number;
  title: string;
  process_name: string;
  pid: number;
}

export interface VolumeState {
  level: number;
  muted: boolean;
}

export interface GpuDetail {
  util: number;
  temp: number;
  power: number;
  power_limit: number;
  vram_used: number;
  vram_total: number;
  fan: number | null;
}

export interface MediaState {
  title: string;
  artist: string;
  album: string;
  source: string;
  playing: boolean;
  position: number;
  duration: number;
  art: string | null;
}

export interface SystemStats {
  cpu: number;
  cores?: number[];
  cpu_name?: string;
  ram_used?: number;
  ram_total?: number;
  gpu_detail?: GpuDetail | null;
  gpu_name?: string | null;
  processes?: number;
  ram: number;
  disk: number;
  disk_activity_mbps: number;
  network_mbps: number;
  gpu: number | null;
  gpu_mem_percent: number | null;
  hostname: string;
  uptime_seconds: number;
}
