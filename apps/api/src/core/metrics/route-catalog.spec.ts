import { All, Controller, Get, Head, Options, Post } from '@nestjs/common';
import type { ModulesContainer } from '@nestjs/core';
import { collectMetricRoutes, HTTP_METHODS } from './route-catalog';

@Controller(['test', 'alias'])
class TestController {
  @Get(['', 'items']) list() {}
  @Post('items') create() {}
  @Head('probe') probe() {}
  @Options('items') options() {}
  @All('all') all() {}
}

describe('metrics route discovery', () => {
  it('discovers route aliases, uncalled methods, ALL handlers and implicit HEAD without Swagger', () => {
    const modules = new Map([
      [
        'test',
        { controllers: new Map([['test', { metatype: TestController }]]) },
      ],
    ]) as unknown as ModulesContainer;
    const routes = collectMetricRoutes(modules);
    for (const method of ['GET', 'HEAD', 'POST', 'OPTIONS'])
      expect(routes).toContainEqual({ method, path: '/api/test/items' });
    expect(routes).toContainEqual({ method: 'HEAD', path: '/api/test/probe' });
    expect(routes).toContainEqual({ method: 'GET', path: '/api/alias' });
    for (const method of HTTP_METHODS)
      expect(routes).toContainEqual({ method, path: '/api/test/all' });
    expect(new Set(routes.map((row) => `${row.method} ${row.path}`)).size).toBe(
      routes.length,
    );
  });
});
