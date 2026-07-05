declare module 'node-pty' {
  export interface IPtyForkOptions {
    name?: string;
    cols?: number;
    rows?: number;
    cwd?: string;
    env?: { [key: string]: string | undefined };
    encoding?: string | null;
    handleFlowControl?: boolean;
    flowControlPause?: string;
    flowControlResume?: string;
    uid?: number;
    gid?: number;
  }

  export interface IPty {
    readonly pid: number;
    readonly cols: number;
    readonly rows: number;
    readonly process: string;
    handleFlowControl: boolean;
    readonly onData: (listener: (data: string) => void) => { dispose(): void };
    readonly onExit: (listener: (e: { exitCode: number; signal?: number }) => void) => { dispose(): void };
    resize(columns: number, rows: number): void;
    clear(): void;
    write(data: string): void;
    kill(signal?: string): void;
    pause(): void;
    resume(): void;
  }

  export function spawn(
    file: string,
    args: string[] | string,
    options: IPtyForkOptions
  ): IPty;
}
