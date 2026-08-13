declare module 'qrcode' {
  interface QRCodeOptions {
    width?: number;
    margin?: number;
  }

  const QRCode: {
    toDataURL(text: string, options?: QRCodeOptions): Promise<string>;
  };

  export default QRCode;
}
