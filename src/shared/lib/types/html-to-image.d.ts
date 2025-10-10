declare module 'html-to-image' {
  export function toPng(node: HTMLElement, options?: Partial<{
    width: number; height: number; pixelRatio: number; cacheBust: boolean; backgroundColor: string;
  }>): Promise<string>;
}
