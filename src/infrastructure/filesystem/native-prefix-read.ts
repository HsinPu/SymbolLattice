import { close, open, read } from "node:fs";

/** Fill a borrowed buffer through EOF; null requests the existing streaming fallback at capacity. */
export function readNativeFileIntoBuffer(filePath: string, buffer: Buffer): Promise<Uint8Array | null> {
  return new Promise((resolve, reject) => {
    open(filePath, "r", (openError, descriptor) => {
      if (openError) { reject(openError); return; }
      let position = 0;
      const finish = (readError?: unknown): void => {
        close(descriptor, closeError => {
          // Retain try/finally precedence and never release the buffer before close.
          if (closeError || readError) reject(closeError || readError);
          else resolve(position === buffer.byteLength ? null : buffer.subarray(0, position));
        });
      };
      const next = (): void => {
        if (position === buffer.byteLength) { finish(); return; }
        try {
          read(descriptor, buffer, position, buffer.byteLength - position, position, (readError, bytesRead) => {
            if (readError) { finish(readError); return; }
            position += bytesRead;
            if (bytesRead === 0 || position === buffer.byteLength) finish();
            else next();
          });
        } catch (error) {
          finish(error);
        }
      };
      next();
    });
  });
}

/** One bounded asynchronous read; settle only after its descriptor is closed. */
export function readNativeFilePrefix(filePath: string, maximumBytes: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    open(filePath, "r", (openError, descriptor) => {
      if (openError) { reject(openError); return; }
      try {
        const buffer = Buffer.alloc(maximumBytes);
        read(descriptor, buffer, 0, maximumBytes, 0, (readError, bytesRead) => {
          close(descriptor, closeError => {
            // Preserve the previous try/finally precedence for close failures.
            if (closeError || readError) reject(closeError || readError);
            else resolve(buffer.subarray(0, bytesRead));
          });
        });
      } catch (error) {
        close(descriptor, closeError => reject(closeError || error));
      }
    });
  });
}
