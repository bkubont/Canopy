const { test, expect } = require('@playwright/test');

test('V1.2 creates scoped jobs, visit crews, workflow and phase history', async ({ page }) => {
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await page.locator('[data-nav="clients"]').click();
  await page.getByRole('button',{name:'+ Contact',exact:true}).click();
  await page.getByLabel('Contact name').fill('Sample Arbor Client');
  await page.getByLabel('Phone').fill('555-0100');
  await page.getByLabel('Property address').fill('10 Sample Street, Detroit');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.locator('[data-nav="workers"]').click();
  for (const [name,position] of [['Sample Climber','climbing_arborist'],['Sample Driver','cdl_driver']]) {
    await page.getByRole('button',{name:'+ Worker',exact:true}).click();
    await page.getByLabel('Name').fill(name); await page.getByLabel('Primary position').selectOption(position);
    await page.getByLabel('Worker notes').fill('Fictional test worker'); await page.getByRole('button',{name:'Save',exact:true}).click();
  }
  await page.locator('[data-nav="projects"]').click();
  await page.getByRole('button',{name:'+ Job',exact:true}).click();
  await page.getByLabel('Contact / client').selectOption({label:'Sample Arbor Client'});
  await page.getByLabel('Tree Removal').check(); await page.getByLabel('Stump Grinding').check();
  await page.getByLabel('Job notes (optional)').fill('Remove rear oak\nProtect sample fence.');
  expect(await page.locator('input[name="workers"]').count()).toBe(0);
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Sample Arbor Client',exact:true})).toBeVisible();
  await expect(page.locator('a[href="tel:555-0100"]')).toBeVisible();
  await expect(page.getByText('Tree Removal, Stump Grinding',{exact:true})).toBeVisible();
  await expect(page.getByText('Remove rear oak\nProtect sample fence.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'+ Visit',exact:true}).click();
  await page.getByLabel('Visit type').selectOption('estimate'); await page.getByLabel('Start time').fill('10:00');
  await expect(page.getByLabel('End time')).toHaveValue('12:00');
  await page.getByLabel('Sample Climber').check(); await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByRole('button',{name:'+ Visit',exact:true}).click();
  await page.getByLabel('Visit type').selectOption('dump'); await page.getByLabel('Start time').fill('13:00');
  await expect(page.getByLabel('End time')).toHaveValue('14:00'); await page.getByLabel('End time').fill('14:30');
  await page.getByLabel('Sample Driver').check(); await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByRole('button',{name:'Schedule',exact:true}).click();
  await expect(page.locator('.record').filter({hasText:'Estimate Visit'})).toContainText('Sample Climber');
  await expect(page.locator('.record').filter({hasText:'Dump Run'})).toContainText('Sample Driver');
  await expect(page.locator('.record').filter({hasText:'Dump Run'})).toContainText('13:00');
  await expect(page.locator('.record').filter({hasText:'Dump Run'})).toContainText('14:30');
  await page.getByRole('main').getByRole('button',{name:'Overview',exact:true}).click();
  await page.getByRole('button',{name:'Move workflow',exact:true}).click(); await page.getByLabel('New workflow stage').selectOption('approved'); await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.locator('details.phase').filter({hasText:'Prep & Rigging'}).locator('summary').click();
  await page.getByRole('button',{name:'Mark complete',exact:true}).click();
  await page.locator('details.phase').filter({hasText:'Prep & Rigging'}).locator('summary').click(); await page.getByRole('button',{name:'Reopen',exact:true}).click();
  await page.getByRole('button',{name:'Daily history',exact:true}).click();
  await expect(page.getByText('Customer approval recorded',{exact:true})).toBeVisible();
  await expect(page.locator('.history').filter({hasText:'Prep & Rigging completed'})).toBeVisible();
  await expect(page.locator('.history').filter({hasText:'Prep & Rigging reopened'})).toBeVisible();
  await page.locator('[data-nav="projects"]').click(); await page.getByRole('button',{name:'+ Job',exact:true}).click();
  await page.getByLabel('Contact / client').selectOption({label:'Sample Arbor Client'}); await page.getByLabel('Trimming / Pruning').check(); await page.getByRole('button',{name:'Save',exact:true}).click(); await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  await page.reload(); await page.locator('[data-nav="projects"]').click();
  await expect(page.locator('.jobcard').filter({hasText:'Sample Arbor Client'})).toHaveCount(2);
  await page.locator('[data-nav="board"]').click();
  await expect(page.locator('.lane h3')).toHaveText(['Lead · 1','Estimate · 0','Approved · 1','Work Scheduled · 0','Prep & Rigging · 0','Tree Work · 0','Cleanup · 0','Complete · 0']);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('legacy IndexedDB records migrate without silent loss', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{let r=indexedDB.open('canopy-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});let tx=db.transaction('data','readwrite');tx.objectStore('data').put({schema:1,clients:[{id:'c',name:'Legacy Client',phone:'555-0199',address:'Old Road'}],workers:[{id:'w',name:'Legacy Worker',role:'Climber'}],projects:[{id:'p',clientId:'c',title:'Legacy title',description:'Legacy notes',stage:'scheduled',workerIds:['w'],phases:{}}],visits:[{id:'v',projectId:'p',start:'2026-10-11',end:'2026-10-13',workerIds:['w']}],tasks:[],notes:[],photos:[],history:[{id:'h',projectId:'p',phase:'tree',type:'work',message:'Legacy work',date:'2026-10-12',time:'2026-10-12T12:00:00Z'}]},'workspace');await new Promise(resolve=>tx.oncomplete=resolve);db.close()});
  await page.reload(); await page.locator('[data-nav="projects"]').click(); await expect(page.getByText('Legacy Client',{exact:true})).toBeVisible(); await page.getByRole('button',{name:'Open',exact:true}).click();
  await expect(page.getByText('Legacy notes',{exact:true})).toBeVisible(); await expect(page.locator('.tag.work_scheduled')).toHaveText('Work Scheduled');
  await page.getByRole('button',{name:'Schedule',exact:true}).click(); await expect(page.getByText(/Oct 11, 2026.*Oct 13, 2026/)).toBeVisible();
  await page.getByRole('button',{name:'Daily history',exact:true}).click(); await expect(page.locator('.history').filter({hasText:'Legacy work'})).toBeVisible();
});
