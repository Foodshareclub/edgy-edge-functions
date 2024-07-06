// types.ts
export interface OptimisedImage {
	input:  Input;
	output: Output;
	base64: string;
}

export interface Input {
	size: number;
	type: string;
}

export interface Output {
	size:   number;
	type:   string;
	width:  number;
	height: number;
	ratio:  number;
	url:    string;
}