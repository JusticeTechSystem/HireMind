import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
/** One error shape for everything: 4xx pass through, anything unexpected becomes a generic 500 (no internals leaked). 5xx are logged and reported with the request id. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private log = new Logger('Http');
  constructor(private report: (e: unknown) => void = () => undefined) {}
  catch(e: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp(); const res = http.getResponse(); const req = http.getRequest();
    const isHttp = e instanceof HttpException; const status = isHttp ? e.getStatus() : 500; const requestId = req?.headers?.['x-request-id'];
    if (status >= 500) { this.report(e); this.log.error(JSON.stringify({ requestId, method: req?.method, path: req?.url, status, message: (e as Error)?.message })); }
    const body = isHttp ? e.getResponse() : { message: 'Internal server error' };
    res.status(status).json({ ...(typeof body === 'string' ? { message: body } : (body as object)), statusCode: status, requestId });
  }
}
