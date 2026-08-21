import { chromium } from "playwright";
import { mkdirSync, renameSync } from "node:fs";
import { join, resolve } from "node:path";

const baseUrl = process.env.SHERLOCK_BASE_URL ?? "http://127.0.0.1:5173";
const outputDir = resolve(process.cwd(), "recordings");
mkdirSync(outputDir, { recursive: true });

const pause = (ms) => new Promise((resolvePause) => setTimeout(resolvePause, ms));

async function smoothScroll(page, amount, steps = 36) {
  for (let index = 0; index < steps; index += 1) {
    await page.mouse.wheel(0, amount / steps);
    await pause(18);
  }
}

async function focusClick(page, locator) {
  await locator.scrollIntoViewIfNeeded({ timeout: 4000 });
  const box = await locator.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
  }
  await locator.click({ timeout: 4000 });
  await pause(700);
}

async function clickFirstVisible(page, locators) {
  for (const locator of locators) {
    if (await locator.count()) {
      const target = locator.first();
      if (await target.isVisible().catch(() => false)) {
        const disabled = await target.isDisabled().catch(() => false);
        if (!disabled) {
          await focusClick(page, target);
          return true;
        }
      }
    }
  }
  return false;
}

async function nav(page, label) {
  console.log(`nav:${label}`);
  await focusClick(page, page.getByRole("button", { name: label, exact: true }).first());
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    recordVideo: { dir: outputDir, size: { width: 1440, height: 900 } }
  });

  const page = await context.newPage();
  const video = page.video();
  page.setDefaultTimeout(15000);
  await page.addInitScript(() => {
    localStorage.removeItem("sherlock:studio-state");
    localStorage.removeItem("watson-clone:studio-state");
    localStorage.removeItem("sherlock-sidebar-collapsed");
    localStorage.removeItem("watson-clone-sidebar-collapsed");
    localStorage.removeItem("sherlock-show-audit");
    localStorage.removeItem("watson-clone-show-audit");
  });

  console.log(`open:${baseUrl}`);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await pause(1200);
  await smoothScroll(page, 560);
  await smoothScroll(page, -320);

  await nav(page, "Projetos");
  await page.locator(".project-header-actions select").selectOption({ label: "treinos" });
  await pause(800);
  await smoothScroll(page, 620);
  await smoothScroll(page, -360);

  await nav(page, "Dados");
  await pause(600);
  await page.locator(".asset-source-panel select").selectOption({ index: 1 });
  await pause(1000);
  console.log("segment:data-refinery");
  await clickFirstVisible(page, [page.getByRole("button", { name: /Transformacao/i })]);
  await clickFirstVisible(page, [page.getByRole("button", { name: /Preparar classificacao/i })]);
  await smoothScroll(page, 520);
  await smoothScroll(page, -420);
  await clickFirstVisible(page, [page.getByRole("button", { name: /Visualizacoes/i })]);
  await smoothScroll(page, 420);
  console.log("segment:visualization-canvas");
  await clickFirstVisible(page, [page.getByRole("button", { name: /Abrir visualizacao completa/i })]);

  await pause(900);
  await smoothScroll(page, 260);
  await clickFirstVisible(page, [
    page.getByRole("button", { name: /Executar/i }),
    page.getByText(/Executar/i)
  ]);
  await pause(1200);
  await smoothScroll(page, 380);
  await smoothScroll(page, -260);
  await clickFirstVisible(page, [
    page.getByRole("button", { name: /Voltar/i }),
    page.locator("button[title='Voltar']")
  ]);

  await nav(page, "AutoAI");
  console.log("segment:autoai");
  await clickFirstVisible(page, [page.getByRole("button", { name: /Aplicar recomendacoes/i })]);
  await clickFirstVisible(page, [page.getByRole("button", { name: /Configurar/i })]);
  await smoothScroll(page, 420);
  await smoothScroll(page, -300);
  await clickFirstVisible(page, [page.getByRole("button", { name: /Executar AutoAI/i })]);
  await pause(2600);
  await smoothScroll(page, 520);
  await clickFirstVisible(page, [page.getByRole("button", { name: /Visual Modeler/i })]);
  await pause(700);
  await smoothScroll(page, 360);

  await nav(page, "Notebooks");
  console.log("segment:notebooks");
  await pause(700);
  await clickFirstVisible(page, [
    page.getByRole("button", { name: /Novo notebook/i }),
    page.getByRole("button", { name: /Editar/i }).first()
  ]);
  await pause(700);
  await smoothScroll(page, 520);
  await smoothScroll(page, -280);
  await page.mouse.move(1220, 120, { steps: 28 });
  await pause(1000);

  await context.close();
  await browser.close();

  const sourcePath = await video.path();
  const targetPath = join(outputDir, "sherlock-demo.webm");
  renameSync(sourcePath, targetPath);
  console.log(`video:${targetPath}`);
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
