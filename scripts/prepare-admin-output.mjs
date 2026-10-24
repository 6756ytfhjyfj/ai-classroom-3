import {cpSync,mkdirSync,writeFileSync} from 'node:fs';
const out='admin-site/.vercel/output';mkdirSync(out+'/static',{recursive:true});
cpSync('admin-site/dist',out+'/static',{recursive:true});
writeFileSync(out+'/config.json',JSON.stringify({version:3,routes:[
 {src:'/(.*)',headers:{'X-Frame-Options':'DENY','X-Content-Type-Options':'nosniff'},continue:true},
 {src:'/api/(.*)',dest:'https://onclasstime.vercel.app/api/$1'},
 {handle:'filesystem'},{src:'/(.*)',dest:'/index.html'},
]},null,2));
