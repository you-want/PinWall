import { readFileSync } from "node:fs";
import { test,expect } from "./fixtures/tauri";
import type { WidgetManifest } from "../src/types";
async function install(page:import('@playwright/test').Page,folder:string){
  const root=`resources/widgets/${folder}`,manifest=JSON.parse(readFileSync(`${root}/widget.json`,"utf8")) as WidgetManifest;
  await page.addInitScript(pkg=>{if(window===window.top&&location.origin==="http://localhost:1932")localStorage.setItem("pinwall-e2e:widgets:package",JSON.stringify(pkg));},{manifest,html:readFileSync(`${root}/index.html`,"utf8")});
  await page.goto('/?window=settings');await page.getByRole('button',{name:/^Experimental/}).click();page.once('dialog',d=>d.accept());
  await page.locator('.ap-widget-catalog-card').filter({hasText:manifest.name}).getByRole('button',{name:'Install',exact:true}).click();
  const row=page.locator('.ap-widget-installed-row');await expect(row.getByRole('checkbox')).not.toBeChecked();await row.getByRole('checkbox').check();await page.goto('/');return page.frameLocator(`iframe[title="${manifest.name}"]`);
}
test('audio device controls and real-player boundary handle authorization failures without demo success',async({page})=>{
  const widget=await install(page,'widget-music');await widget.getByRole('button',{name:'Open audio tools'}).click();const dialog=page.getByRole('dialog',{name:'Audio & media',exact:true});
  await expect(dialog.getByRole('list',{name:'Audio devices',exact:true}).getByRole('listitem')).toHaveCount(3);const speakers=dialog.getByRole('listitem').filter({hasText:'Built-in speakers'}),usb=dialog.getByRole('listitem').filter({hasText:'USB output'});
  await speakers.getByRole('spinbutton').fill('35');await speakers.getByRole('button',{name:'Set volume',exact:true}).click();await expect(speakers.getByRole('spinbutton')).toHaveValue('35');
  await speakers.getByRole('button',{name:'Mute',exact:true}).click();await expect(speakers.getByRole('button',{name:'Unmute',exact:true})).toBeVisible();
  await usb.getByRole('button',{name:'Set as default device'}).click();await expect(usb.getByRole('button',{name:'Set as default device'})).toBeDisabled();await expect(usb).toContainText('hardware controls');
  await page.evaluate(()=>localStorage.setItem('pinwall-e2e:media:fail','desktop_automation_denied'));await dialog.getByRole('button',{name:'Read current track'}).click();await expect(dialog.getByRole('alert')).toContainText('Automation');
  await page.evaluate(()=>localStorage.removeItem('pinwall-e2e:media:fail'));await dialog.getByRole('button',{name:'Next track'}).click();await expect(dialog.getByRole('status')).toContainText('Synthetic fixture song');
  expect(await page.evaluate(()=>localStorage.getItem('pinwall-e2e:media:lastAction'))).toBe('next');
  const routing=dialog.getByRole('region',{name:'Per-application audio routing'});
  await page.evaluate(()=>localStorage.setItem('pinwall-e2e:routes:fail','desktop_route_denied'));await routing.getByRole('button',{name:'Start selected process route'}).click();await expect(routing.getByRole('alert')).toContainText('audio capture was denied');
  await page.evaluate(()=>localStorage.removeItem('pinwall-e2e:routes:fail'));await routing.getByRole('button',{name:'Start selected process route'}).click();const route=routing.getByRole('listitem');await expect(route).toContainText('Fixture Player');
  await route.getByRole('spinbutton').fill('0');await route.getByRole('button',{name:'Set application gain'}).click();expect(JSON.parse((await page.evaluate(()=>localStorage.getItem('pinwall-e2e:routes:active')))!)[0].gain).toBe(0);
  await dialog.getByRole('button',{name:'Close',exact:true}).click();await widget.getByRole('button',{name:'Open audio tools'}).click();await expect(speakers.getByRole('spinbutton')).toHaveValue('35');await expect.poll(()=>page.evaluate(()=>localStorage.getItem('pinwall-e2e:routes:active'))).toBe('[]');
});
test('window tools recover authorization and allow explicit layout, preview and original-layout restoration',async({page})=>{
  await page.setViewportSize({width:390,height:700});const widget=await install(page,'widget-window-tools');
  await page.evaluate(()=>localStorage.setItem('pinwall-e2e:windows:denied','true'));await widget.getByRole('button',{name:'Open window tools'}).click();const dialog=page.getByRole('dialog',{name:'Window tools',exact:true});
  await dialog.getByRole('button',{name:'Grant Accessibility permission'}).click();expect(await page.evaluate(()=>localStorage.getItem('pinwall-e2e:windows:permissionRequested'))).toBe('true');
  await page.evaluate(()=>localStorage.removeItem('pinwall-e2e:windows:denied'));await dialog.getByRole('button',{name:'Refresh',exact:true}).click();await expect(dialog.getByLabel('Choose a window')).toContainText('Synthetic document');
  await dialog.getByLabel('Window layout',{exact:true}).selectOption('quarterBottomRight');await dialog.getByRole('button',{name:'Apply layout'}).click();await expect(dialog.getByRole('status')).toContainText('adjusted the layout');await expect(dialog.getByRole('button',{name:'Restore original layout'})).toBeEnabled();
  await page.evaluate(()=>localStorage.setItem('pinwall-e2e:windows:fail','desktop_screen_denied'));await dialog.getByRole('button',{name:'Preview selected window'}).click();await expect(dialog.getByRole('alert')).toContainText('Screen Recording');
  await page.evaluate(()=>localStorage.removeItem('pinwall-e2e:windows:fail'));await dialog.getByRole('button',{name:'Preview selected window'}).click();await expect(dialog.getByRole('img')).toBeVisible();
  await dialog.getByRole('button',{name:'Restore original layout'}).click();await expect(dialog.getByRole('status')).toHaveText('Original layout restored.');await expect(dialog.getByRole('button',{name:'Restore original layout'})).toBeDisabled();
  await dialog.getByRole('button',{name:'Switch to window'}).click();expect(JSON.parse((await page.evaluate(()=>localStorage.getItem('pinwall-e2e:windows:lastAction')))!)).toMatchObject({method:'focus'});
  await dialog.getByRole('button',{name:'Start Dock hover previews'}).click();await expect(dialog.getByRole('button',{name:'Stop Dock hover previews'})).toBeVisible();
  await dialog.getByRole('button',{name:'Close',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('pinwall-e2e:dock:active'))).toBe('true');
  await widget.getByRole('button',{name:'Open window tools'}).click();await dialog.getByRole('button',{name:'Stop Dock hover previews'}).click();expect(await page.evaluate(()=>localStorage.getItem('pinwall-e2e:dock:active'))).toBe('false');
  await page.screenshot({path:'/tmp/pinwall-windows-narrow.png',fullPage:true});
});
