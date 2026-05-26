export enum Mode {
  Dev        = "dev",
  Readonly   = "readonly",
  Restricted = "restricted",
}

export interface ServerConfig {
  mode:       Mode;
  host:       string;
  port:       number;
  configPath?: string;
  /** Working directory used when --launch was specified. Logged at startup. */
  launchCwd?: string;
}
