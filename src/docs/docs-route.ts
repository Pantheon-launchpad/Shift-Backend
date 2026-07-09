import type { Express } from "express";
import path from "path";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";

export function mountDocs(app: Express) {
  const specPath = path.join(__dirname, "openapi.yaml");
  const openapiSpec = YAML.load(specPath);

  app.use(
    "/docs",
    swaggerUi.serve,
    swaggerUi.setup(openapiSpec, {
      customSiteTitle: "Shift API Docs",
      swaggerOptions: { persistAuthorization: true },
    })
  );

  app.get("/openapi.yaml", (_req, res) => {
    res.type("text/yaml").send(YAML.stringify(openapiSpec, 10));
  });
  app.get("/openapi.json", (_req, res) => {
    res.json(openapiSpec);
  });
}
