/** Error con código HTTP que el manejador de errores devuelve tal cual al cliente. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** notFound("la venta") → "No se encontró la venta" */
export const notFound = (what: string) => new HttpError(404, `No se encontró ${what}`);
