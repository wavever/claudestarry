import { defineConfig } from 'vite';
import {writeFile,rename,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {normalizeConfig} from './src/config.js';
const presetFile=fileURLToPath(new URL('./debug-preset.json',import.meta.url));
function localPresetPlugin(){return {name:'afterlight-local-preset',configureServer(server){
  server.middlewares.use(async(req,res,next)=>{
    if(req.url?.split('?')[0]!=='/__afterlight/preset')return next();
    res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
    if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`){res.statusCode=403;res.end(JSON.stringify({error:'Origin denied'}));return;}
    try{
      if(req.method==='GET'){
        let preset=null;try{preset=JSON.parse(await readFile(presetFile,'utf8'));}catch{}
        res.end(JSON.stringify({preset}));return;
      }
      if(req.method!=='POST'){res.statusCode=405;res.end(JSON.stringify({error:'Method not allowed'}));return;}
      const chunks=[];let bytes=0;
      for await(const chunk of req){bytes+=chunk.length;if(bytes>16384){res.statusCode=413;res.end(JSON.stringify({error:'Preset too large'}));return;}chunks.push(chunk);}
      const preset=normalizeConfig(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      const temp=presetFile+'.tmp';await writeFile(temp,JSON.stringify(preset,null,2)+'\n');await rename(temp,presetFile);
      res.end(JSON.stringify({ok:true}));
    }catch(error){res.statusCode=400;res.end(JSON.stringify({error:'Unable to save preset'}));}
  });
}};}


export default defineConfig({
  plugins:[localPresetPlugin()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/three/build/') || id.includes('/three/src/')) return 'three-core';
          if (id.includes('/three/examples/')) return 'three-effects';
        }
      }
    }
  }
});
