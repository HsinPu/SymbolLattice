import { close, open, read } from "node:fs";

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
