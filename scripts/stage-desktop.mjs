import {mkdirSync,cpSync,writeFileSync,readFileSync} from 'node:fs';
const pkg=JSON.parse(readFileSync('package.json','utf8'));
mkdirSync('desktop-app',{recursive:true});
for(const dir of ['dist','dist-electron'])cpSync(dir,`desktop-app/${dir}`,{recursive:true});
writeFileSync('desktop-app/package.json',JSON.stringify({name:pkg.name,version:pkg.version,description:pkg.description,author:'ONclasstime',main:'dist-electron/main.cjs',private:true},null,2));
