import { test, expect, type Page } from "@playwright/test";
const origin = "http://127.0.0.1:5173";
async function login(page: Page) {
  await page.route("https://tile.openstreetmap.org/**", (r) => r.abort());
  await page.goto("/signin-with-chatgpt?return_to=/");
  await expect(
    page
      .getByRole("button", { name: "Configurar apresentação" })
      .or(page.getByRole("heading", { name: "Sua operação, em movimento." })),
  ).toBeVisible();
  if (
    await page
      .getByRole("button", { name: "Configurar apresentação" })
      .isVisible()
  )
    await page.getByRole("button", { name: "Configurar apresentação" }).click();
  if (
    await page
      .getByRole("button", { name: "Abrir menu", exact: true })
      .isVisible()
  )
    await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await page.getByRole("link", { name: "Rotas e paradas" }).click();
}
async function post(page: Page, path: string, data: unknown) {
  const r = await page.request.post("/api" + path, {
    headers: { Origin: origin },
    data,
  });
  expect(r.status(), await r.text()).toBeLessThan(300);
  return r.json();
}
test("cinco toques, explorar sem adicionar, desfazer/refazer, reordenar e persistir", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.getByRole("button", { name: "Criar rota", exact: true }).click();
  const dialog = page.getByRole("dialog"),
    map = dialog.locator(".maplibregl-canvas");
  await expect(map).toBeVisible();
  await expect(dialog.getByLabel("Nome da rota")).toHaveValue(/Nova rota \d+/);
  await map.click({ position: { x: 300, y: 260 } });
  await expect(dialog.locator(".stop-edit")).toHaveCount(1);
  await page.waitForTimeout(600);
  for (const [x, y] of [
    [360, 280],
    [420, 320],
    [470, 360],
    [500, 410],
  ]) {
    await map.click({ position: { x, y } });
  }
  await expect(dialog.locator(".stop-edit")).toHaveCount(5);
  await dialog
    .getByRole("button", { name: "Explorar mapa", exact: true })
    .click();
  await map.click({ position: { x: 280, y: 400 } });
  await expect(dialog.locator(".stop-edit")).toHaveCount(5);
  await dialog.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(dialog.locator(".stop-edit")).toHaveCount(4);
  await dialog.getByRole("button", { name: "Refazer", exact: true }).click();
  await expect(dialog.locator(".stop-edit")).toHaveCount(5);
  const second = await dialog.getByLabel("Nome da parada 2").inputValue();
  await dialog.getByTitle("Subir parada", { exact: true }).nth(1).click();
  await expect(dialog.getByLabel("Nome da parada 1")).toHaveValue(second);
  await dialog.getByRole("button", { name: "Limpar", exact: true }).click();
  await dialog.getByRole("button", { name: "Manter", exact: true }).click();
  await expect(dialog.locator(".stop-edit")).toHaveCount(5);
  await dialog
    .getByRole("button", { name: "Pré-visualizar vias", exact: true })
    .click();
  await expect(dialog.locator(".editor-preview")).toBeVisible();
  const name = "Editor cinco pontos " + Date.now();
  await dialog.getByLabel("Nome da rota").fill(name);
  await page.screenshot({
    path: "docs/screenshots/editor-desktop.png",
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "Salvar itinerário", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  const card = page
    .locator(".route-card")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await expect(card).toBeVisible();
  await card
    .getByRole("button", { name: "Editar itinerário", exact: false })
    .click();
  await expect(dialog.locator(".stop-edit")).toHaveCount(5);
  await expect(dialog.getByLabel("Nome da parada 1")).toHaveValue(second);
  await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
  const state = await (await page.request.get("/api/state")).json();
  await post(
    page,
    `/routes/${state.routes.find((r: { name: string }) => r.name === name).id}/archive`,
    {},
  );
});
test("motorista cria pelo acesso do app, gestão aprova e aluno recebe após publicação", async ({
  browser,
  page,
}) => {
  await login(page);
  const state = await (await page.request.get("/api/state")).json();
  const pair = await post(page, "/driver/pair", {
    driverId: state.drivers.find(
      (d: { userId: string; status: string }) =>
        d.userId && d.status === "active",
    ).id,
  });
  const context = await browser.newContext({ baseURL: origin });
  const driver = await context.newPage();
  await driver.route("https://tile.openstreetmap.org/**", (r) => r.abort());
  const exchange = await context.request.post("/api/driver/exchange", {
    headers: { Origin: origin },
    data: { code: pair.code },
  });
  expect(exchange.status()).toBe(200);
  const { token } = await exchange.json();
  const link = await context.request.post("/api/driver/editor-link", {
    headers: { Authorization: "Bearer " + token },
    data: {},
  });
  expect(link.status()).toBe(200);
  const { code } = await link.json();
  await driver.goto("/#/motorista?codigo=" + code);
  await expect(
    driver.getByRole("heading", { name: "Rotas e paradas", exact: true }),
  ).toBeVisible();
  expect(driver.url()).not.toContain(code);
  await expect(driver.getByLabel("Perfil de demonstração")).toHaveCount(0);
  await expect(
    driver.getByRole("link", { name: "Veículos", exact: true }),
  ).toHaveCount(0);
  await driver.getByRole("button", { name: "Criar rota", exact: true }).click();
  const dialog = driver.getByRole("dialog");
  const map = dialog.locator(".maplibregl-canvas");
  await expect(map).toBeVisible();
  await map.click({ position: { x: 260, y: 260 } });
  await expect(dialog.locator(".stop-edit")).toHaveCount(1);
  await driver.waitForTimeout(600);
  await map.click({ position: { x: 320, y: 300 } });
  const name = "Motorista aprovação " + Date.now();
  await dialog.getByLabel("Nome da rota").fill(name);
  await dialog.getByRole("button", { name: "Salvar rascunho" }).click();
  const card = driver
    .locator(".route-card")
    .filter({ has: driver.getByRole("heading", { name, exact: true }) });
  await expect(card).toBeVisible();
  await expect(
    card.getByRole("button", { name: "Publicar para alunos" }),
  ).toHaveCount(0);
  await card.getByRole("button", { name: "Enviar para aprovação" }).click();
  await expect(card.getByText("Aguardando aprovação")).toBeVisible();
  await page.reload();
  const adminCard = page
    .locator(".route-card")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await adminCard.getByRole("button", { name: "Aprovar rota" }).click();
  await expect(
    adminCard.getByText("Aprovada · ainda não publicada"),
  ).toBeVisible();
  await adminCard.getByRole("button", { name: "Publicar para alunos" }).click();
  await expect(adminCard.getByText("Publicada para os alunos")).toBeVisible();
  const student = await browser.newContext({ baseURL: origin });
  const joined = await student.request.post("/api/journey/join", {
    headers: { Origin: origin },
    data: { schoolId: state.organization.id, name: "Participante editor" },
  });
  expect(joined.status()).toBeLessThan(300);
  const journey = await (
    await student.request.get("/api/journey/state")
  ).json();
  expect(journey.routes.some((r: { name: string }) => r.name === name)).toBe(
    true,
  );
  await post(
    page,
    `/routes/${journey.routes.find((r: { name: string }) => r.name === name).id}/archive`,
    {},
  );
  await student.close();
  await context.close();
});
test("editor no celular usa localização consentida, referências reais e região vazia", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: -7.2185,
    longitude: -35.8855,
    accuracy: 12,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.getByRole("button", { name: "Criar rota", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".maplibregl-canvas")).toBeVisible();
  await dialog
    .getByRole("button", { name: "Minha localização", exact: true })
    .click();
  await expect(
    dialog.getByText("Precisão aproximada: 12 m.", { exact: false }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Usar como origem" }).click();
  await expect(dialog.locator(".stop-edit")).toHaveCount(1);
  await dialog
    .getByRole("button", { name: "Buscar referências nesta região" })
    .click();
  await expect(dialog.locator(".poi-results button").first()).toBeVisible();
  await dialog.locator(".poi-results button").first().click();
  await expect(
    dialog.getByRole("button", { name: "Adicionar parada próxima" }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Adicionar parada próxima" })
    .click();
  await expect(dialog.locator(".editor-map-hint")).toContainText(
    "Toque na via próxima",
  );
  await expect(dialog.locator(".stop-edit")).toHaveCount(1);
  await dialog
    .getByRole("button", { name: "Minha localização", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/screenshots/editor-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await dialog.getByLabel("Buscar cidade ou coordenadas").fill("0, 0");
  await dialog
    .getByRole("button", { name: "Buscar no mapa", exact: true })
    .click();
  await page.waitForTimeout(900);
  await dialog
    .getByRole("button", { name: "Buscar referências nesta região" })
    .click();
  await expect(
    dialog.getByText("Nenhuma referência cadastrada nesta região.", {
      exact: false,
    }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "No centro do mapa", exact: true })
    .click();
  const name = "Origem GPS consentida " + Date.now();
  await dialog.getByLabel("Nome da rota", { exact: true }).fill(name);
  await dialog
    .getByRole("button", { name: "Salvar itinerário", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const saved = await (await page.request.get("/api/state")).json();
  const route = saved.routes.find((r: { name: string }) => r.name === name);
  expect(route.stops[0].lat).toBe(-7.2185);
  expect(route.stops[0]).not.toHaveProperty("accuracy");
  expect(route.stops[0]).not.toHaveProperty("timestamp");
  expect(route.distanceMeters).toBeNull();
  await post(page, `/routes/${route.id}/archive`, {});
});
