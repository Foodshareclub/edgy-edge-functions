import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { crypto } from "https://deno.land/std@0.201.0/crypto/mod.ts";
import {
	ImageMagick,
	initialize,
	MagickFormat,
} from "https://deno.land/x/imagemagick_deno@0.0.25/mod.ts";
import { Tinify } from "https://deno.land/x/tinify@v1.0.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.33.2";

import response from "../_shared/response.ts";
import { corsHeaders } from '../_shared/cors.ts'

import { OptimisedImage } from "./types.ts";

const maxWidth = 1000;

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
	const binary_string =  atob(base64);
	const len = binary_string.length;
	const bytes = new Uint8Array( len );
	for (let i = 0; i < len; i++)        {
		bytes[i] = binary_string.charCodeAt(i);
	}
	return bytes.buffer;
}

serve(async (req) => {
	if (req.method === 'OPTIONS') {
		return new Response('ok', { headers: corsHeaders })
	}

	const supabaseClient = createClient(
		Deno.env.get("SUPABASE_URL") as string,
		Deno.env.get("SUPABASE_ANON_KEY") as string
	);

	const data = new Uint8Array(await req.arrayBuffer());

	const tinify = new Tinify({
		api_key: Deno.env.get("TINIFY_API_KEY") as string
	});

	await initialize();

	return new Promise((resolve) => {
		ImageMagick.read(data, (img) => {
			// Resize image, maintaining aspect ratio
			const ratio = Math.min(maxWidth / img.width, maxWidth / img.height);

			if (img.width > maxWidth || img.height > maxWidth) {
				if (img.width === img.height) {
					img.resize(maxWidth, maxWidth);
				} else if (img.width > img.height) {
					img.resize(maxWidth, maxWidth * ratio);
				} else {
					img.resize(maxWidth * ratio, maxWidth);
				}
			}
	
			img.write(
				MagickFormat.Png,
				async (data) => {
					// Tinify & convert response to buffer
					const tinyImage = await tinify.compress(data);
					const tinyImageBase64: OptimisedImage = await tinyImage.toBase64();
					const tinyImageBuffer = base64ToArrayBuffer(tinyImageBase64.base64);
	
					// Upload buffer to store
					const fileName = `${crypto.randomUUID()}-${new Date().getTime()}.png`;
					const res = await supabaseClient.storage.from("images").upload(fileName, tinyImageBuffer, {
						contentType: "image/png"
					});
	
					if (res.error) {
						resolve(response(res.error.message, 400));
					} else {
						resolve(response(JSON.stringify(res.data), 200));
					}
				}
			);
		});
	}) 
});