import {
    ImageMagick,
    IMagickImage,
    initializeImageMagick,
    MagickFormat,
  } from "https://deno.land/x/imagemagick_deno/mod.ts";
  
  await initializeImageMagick(); // make sure to initialize first!
  
  const data: Uint8Array = await Deno.readFile("image.jpg");
  
  ImageMagick.read(data, (img: IMagickImage) => {
    img.resize(200, 100);
    img.blur(20, 6);
  
    img.write(
      (data: Uint8Array) => Deno.writeFile("image-blur.jpg", data),
      MagickFormat.Jpeg,
    );
  });