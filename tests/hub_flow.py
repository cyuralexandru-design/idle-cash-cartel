import sys, json
from playwright.sync_api import sync_playwright
OUT='/home/claude/game/tests/'
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,has_touch=True)
    pg=ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_function('window.__iccReady===true',timeout=15000)
    pg.screenshot(path=OUT+'hub_loading.png')
    pg.click('#tap-start',force=True); pg.wait_for_timeout(500)
    pg.evaluate("G.save.state.cash=500;G.save.state.gold=3000;G.save.state.gems=50;G.save.state.lastSeen=Date.now()-3600*1000*3; ")
    pg.evaluate("G.ui.update('init')")
    pg.click('[data-biz=pub] .buy'); pg.wait_for_timeout(200)
    pg.evaluate("G.save.state.cash=5000; G.economy.buy('bookmaker',3); G.economy.buy('garage',1); G.ui.update('init')")
    pg.wait_for_timeout(1500)
    pg.screenshot(path=OUT+'hub_biz.png')
    for t in ['crew','work','shop','raid']:
        pg.click(f'[data-tab={t}]'); pg.wait_for_timeout(300); pg.screenshot(path=OUT+f'hub_{t}.png')
    pg.click('[data-tab=work]'); pg.evaluate("document.getElementById('panes').scrollTop=900"); pg.wait_for_timeout(200); pg.screenshot(path=OUT+'hub_work2.png')
    pg.click('[data-tab=raid]')
    pg.click('#btn-settings'); pg.wait_for_timeout(400); pg.screenshot(path=OUT+'hub_settings.png'); pg.click('.close-x')
    pg.click('.raid-go'); pg.wait_for_timeout(1500); pg.screenshot(path=OUT+'hub_raid_start.png')
    pg.evaluate("__arenaTest.god(true); __arenaTest.skipWave()"); pg.wait_for_timeout(600); pg.screenshot(path=OUT+'hub_raid_cards.png')
    pg.evaluate("window.__r=null")
    # loop through screens until ended
    for i in range(40):
        st=pg.evaluate("document.getElementById('scr-arena').hidden")
        if st: break
        pg.evaluate("""(()=>{const L=document.querySelector('.arena-layer');
          if(L){const s=L.getAttribute('data-screen'); if(s==='cards'){L.querySelector('.arena-card').click();} else if(s==='shop'){L.querySelector('[data-act=next]').click();}}
          else {__arenaTest.skipWave();}})()""")
        pg.wait_for_timeout(250)
        if i==3: pg.screenshot(path=OUT+'hub_raid_shop.png')
    pg.wait_for_timeout(1200)
    print('arena hidden', pg.evaluate("document.getElementById('scr-arena').hidden"), 'modal', pg.evaluate("!!document.querySelector('.modal')"))
    pg.screenshot(path=OUT+'hub_results.png')
    before=pg.evaluate("[G.save.state.gold,G.save.state.stats.bestWave,G.save.state.stats.runs]")
    pg.click('.modal-foot .btn'); pg.wait_for_timeout(400)
    print('after',before)
    pg.evaluate("G.save.holdLastSeen=true;G.save.state.lastSeen=Date.now()-3*3600*1000;G.save.save()")
    pg.reload(); pg.wait_for_function('window.__iccReady===true'); 
    print('reload', pg.evaluate("[G.save.state.gold,G.save.state.stats.bestWave,G.save.state.stats.runs,G.save.state.businesses.pub.level]"))
    pg.click('#tap-start',force=True); pg.wait_for_timeout(800); pg.screenshot(path=OUT+'hub_popup.png')
    print('ERRS',errs[:8])
    b.close()
