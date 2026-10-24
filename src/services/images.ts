export async function imageData(file:Blob,type="image/webp"):Promise<string>{
 if(file.size>12*1024*1024)throw Error("原始图片请小于 12 MB");
 if(!["image/png","image/jpeg","image/webp"].includes(file.type))throw Error("请选择 PNG、JPEG 或 WebP 图片");
 const bitmap=await createImageBitmap(file);
 try{let scale=Math.min(1,2200/Math.max(bitmap.width,bitmap.height));for(let attempt=0;attempt<5;attempt++){const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext("2d")!.drawImage(bitmap,0,0,canvas.width,canvas.height);const data=canvas.toDataURL(type,0.88);if(data.length<2_750_000)return data;scale*=0.75}throw Error("图片压缩后仍超过 2 MB，请裁剪后上传")}finally{bitmap.close()}
}
