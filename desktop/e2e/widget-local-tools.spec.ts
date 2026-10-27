import { readFileSync } from "node:fs";
import { test, expect } from "./fixtures/tauri";
import type { WidgetManifest } from "../src/types";

test("offline utilities clean links, calculate and persist reviewed snippets with explicit copying",async({page})=>{
  const root="resources/widgets/widget-local-tools";
  const manifest=JSON.parse(readFileSync(`${root}/widget.json`,"utf8")) as WidgetManifest;
  await page.addInitScript(pkg=>{if(window===window.top&&location.origin==="http://localhost:1932")localStorage.setItem("pinwall-e2e:widgets:package",JSON.stringify(pkg));},{manifest,html:readFileSync(`${root}/index.html`,"utf8")});
  await page.setViewportSize({width:390,height:700});await page.goto("/?window=settings");
  await page.getByRole("button",{name:/^Experimental/}).click();page.once("dialog",dialog=>dialog.accept());
  await page.locator(".ap-widget-catalog-card").filter({hasText:manifest.name}).getByRole("button",{name:"Install",exact:true}).click();
  const row=page.locator(".ap-widget-installed-row");await expect(row.getByRole("checkbox")).not.toBeChecked();await row.getByRole("checkbox").check();
  await page.goto("/");const widget=page.frameLocator(`iframe[title="${manifest.name}"]`);await widget.getByRole("button",{name:"Open local tools",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"Local tools",exact:true});
  await dialog.getByLabel("Original link").fill("https://example.com/p?utm_source=fixture&keep=1#part");await dialog.getByRole("button",{name:"Remove tracking parameters"}).click();
  await expect(dialog.getByLabel("Result")).toHaveValue("https://example.com/p?keep=1#part");
  expect(await page.evaluate(()=>localStorage.getItem("pinwall-e2e:clipboard:lastwrite"))).toBeNull();
  await dialog.getByRole("button",{name:"Copy result"}).click();await expect(dialog.getByRole("status")).toContainText(["Parameters removed: 1","Copied"]);
  await dialog.getByRole("tab",{name:"Calculator",exact:true}).click();await dialog.getByLabel("Expression").fill("sqrt(81)+2^3");await dialog.getByRole("button",{name:"Calculate",exact:true}).click();await expect(dialog.getByLabel("Result")).toHaveText("17");
  await dialog.getByLabel("Expression").fill("1/0");await dialog.getByRole("button",{name:"Calculate",exact:true}).click();await expect(dialog.getByRole("alert")).toContainText("Invalid or oversized");
  await dialog.getByRole("tab",{name:"Text snippets",exact:true}).click();await dialog.getByLabel("Snippet title").fill("Fixture snippet");await dialog.getByLabel("Snippet text").fill("本地片段\nLocal text");await dialog.getByRole("button",{name:"Save snippet",exact:true}).click();await expect(dialog.getByRole("status")).toHaveText("Snippet saved");
  await dialog.getByLabel("Search snippets").fill("missing");await expect(dialog.getByRole("listitem")).toHaveCount(0);await dialog.getByLabel("Search snippets").fill("本地");await expect(dialog.getByRole("listitem")).toHaveCount(1);
  await dialog.getByRole("listitem").getByRole("button",{name:"Copy result"}).click();await expect.poll(()=>page.evaluate(()=>localStorage.getItem("pinwall-e2e:clipboard:lastwrite"))).toBe("本地片段\nLocal text");
  await page.screenshot({path:"/tmp/pinwall-local-tools-narrow.png",fullPage:true});
  await dialog.getByRole("button",{name:"Close",exact:true}).click();await page.reload();await widget.getByRole("button",{name:"Open local tools",exact:true}).click();await dialog.getByRole("tab",{name:"Text snippets",exact:true}).click();await expect(dialog.getByRole("listitem")).toContainText("Fixture snippet");
  page.once("dialog",dialog=>dialog.dismiss());await dialog.getByRole("button",{name:"Clear snippets"}).click();await expect(dialog.getByRole("listitem")).toHaveCount(1);
  page.once("dialog",dialog=>dialog.accept());await dialog.getByRole("button",{name:"Clear snippets"}).click();await expect(dialog.getByRole("listitem")).toHaveCount(0);
});

test("rollback reviews permissions, can be cancelled and restores a disabled previous version",async({page})=>{
  const root="resources/widgets/widget-local-tools";const manifest=JSON.parse(readFileSync(`${root}/widget.json`,"utf8")) as WidgetManifest;
  await page.addInitScript(pkg=>{if(window===window.top&&location.origin==="http://localhost:1932"){
    localStorage.setItem("pinwall-e2e:widgets:package",JSON.stringify(pkg));
    localStorage.setItem("pinwall-e2e:widgets:previous",JSON.stringify({...pkg.manifest,version:"0.9.0"}));
  }},{manifest,html:readFileSync(`${root}/index.html`,"utf8")});
  await page.goto("/?window=settings");await page.getByRole("button",{name:/^Experimental/}).click();page.once("dialog",d=>d.accept());
  await page.locator(".ap-widget-catalog-card").filter({hasText:manifest.name}).getByRole("button",{name:"Install",exact:true}).click();
  const row=page.locator(".ap-widget-installed-row");await row.getByRole("checkbox").check();
  page.once("dialog",d=>d.dismiss());await row.getByRole("button",{name:"Roll back",exact:true}).click();await expect(row).toContainText("v1.0.0");await expect(row.getByRole("checkbox")).toBeChecked();
  page.once("dialog",d=>d.accept());await row.getByRole("button",{name:"Roll back",exact:true}).click();await expect(row).toContainText("v0.9.0");await expect(row.getByRole("checkbox")).not.toBeChecked();
  await page.reload();await page.getByRole("button",{name:/^Experimental/}).click();await expect(row).toContainText("v0.9.0");await expect(row.getByRole("checkbox")).not.toBeChecked();
});
