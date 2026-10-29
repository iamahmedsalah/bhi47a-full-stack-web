import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { MetadataScanner, type ModulesContainer } from '@nestjs/core';

export const HTTP_METHODS = Object.values(RequestMethod).filter(
  (value): value is string => typeof value === 'string' && value !== 'ALL',
);

/** Controller metadata includes handlers excluded from OpenAPI documentation. */
export function collectMetricRoutes(modules: ModulesContainer) {
  const scanner = new MetadataScanner();
  const routes = new Map<string, { method: string; path: string }>();
  const paths = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value : [value ?? ''];
  for (const module of modules.values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype;
      if (!controller?.prototype) continue;
      for (const name of scanner.getAllMethodNames(controller.prototype)) {
        const handler = controller.prototype[name] as object;
        const method: RequestMethod | undefined = Reflect.getMetadata(
          METHOD_METADATA,
          handler,
        );
        if (method === undefined) continue;
        const methods =
          method === RequestMethod.ALL ? HTTP_METHODS : [RequestMethod[method]];
        for (const base of paths(
          Reflect.getMetadata(PATH_METADATA, controller),
        )) {
          for (const suffix of paths(
            Reflect.getMetadata(PATH_METADATA, handler),
          )) {
            const path = `/api/${base}/${suffix}`
              .replace(/\/+/g, '/')
              .replace(/\/$/, '');
            for (const verb of methods)
              routes.set(`${verb} ${path}`, { method: verb, path });
            // Express serves HEAD through GET handlers unless an explicit HEAD handler exists.
            if (methods.includes('GET'))
              routes.set(`HEAD ${path}`, { method: 'HEAD', path });
          }
        }
      }
    }
  }
  return [...routes.values()];
}
