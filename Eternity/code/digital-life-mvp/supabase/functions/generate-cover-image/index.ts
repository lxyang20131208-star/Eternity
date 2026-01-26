// @ts-nocheck
import { encode as base64Encode } from 'https://deno.land/std@0.168.0/encoding/base64.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { prompt, bookTitle, authorName } = await req.json();

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: 'Prompt is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      console.error('GEMINI_API_KEY not configured');
      throw new Error('Server configuration error: API Key missing');
    }

    // Enhance prompt with strict constraints for no text and correct aspect ratio
    const enhancedPrompt = `
      Create a vertical book cover background image (Aspect Ratio 3:4).
      Theme: ${prompt}.
      Style: Professional, artistic, high quality.
      IMPORTANT CONSTRAINT: DO NOT INCLUDE ANY TEXT, LETTERS, OR TITLES ON THE IMAGE.
      The image should be purely illustrative/graphical because text will be added programmatically later.
      Focus on composition, lighting, and mood.
    `.trim();

    console.log('Attempting to generate image with prompt:', enhancedPrompt);

    // ==========================================
    // Strategy 1: Try Imagen 4 Fast (Primary)
    // ==========================================
    try {
      // Updated to use Imagen 4 Fast which is available in the current API model list
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict?key=${geminiApiKey}`;
      
      const payload = {
        instances: [{ prompt: enhancedPrompt }],
        parameters: { sampleCount: 1, aspectRatio: '3:4' }
      };

      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        let imageBase64 = null;
        
        if (data.predictions && data.predictions.length > 0) {
          const prediction = data.predictions[0];
          if (typeof prediction === 'string') imageBase64 = prediction;
          else if (prediction.bytesBase64Encoded) imageBase64 = prediction.bytesBase64Encoded;
          else if (prediction.image?.imageBytes) imageBase64 = prediction.image.imageBytes;
        }

        if (imageBase64) {
          console.log('Imagen 4 generation successful');
          return new Response(
            JSON.stringify({ imageUrl: `data:image/png;base64,${imageBase64}` }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        console.warn(`Imagen 4 failed with status ${response.status}, trying fallback...`);
      }
    } catch (e) {
      console.warn('Imagen 4 exception:', e);
    }

    // ==========================================
    // Strategy 2: Fallback to Gemini 1.5 Flash (SVG Generation)
    // ==========================================
    console.log('Falling back to Gemini 1.5 Flash for SVG generation...');
    
    const svgPrompt = `You are an expert graphic designer. Create a beautiful, artistic SVG code for a book cover.
    
    Book Details:
    - Title: "${bookTitle}"
    - Author: "${authorName}"
    - Theme/Description: ${prompt}
    
    Requirements:
    - Return ONLY the raw <svg>...</svg> code.
    - No markdown formatting (no \`\`\`xml).
    - No explanation text.
    - The SVG should be aspect ratio 3:4 (e.g., viewBox="0 0 600 800").
    - Use rich colors, gradients, and interesting geometric or abstract shapes representing the theme.
    - Make it look professional and suitable for a book cover background.
    - Do NOT include the book title text inside the SVG (it will be overlaid later), just the graphic background.`;

    const flashUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-001:generateContent?key=${geminiApiKey}`;
    
    const flashResponse = await fetch(flashUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: svgPrompt }] }],
        generationConfig: { temperature: 0.7 }
      })
    });

    if (!flashResponse.ok) {
      const errText = await flashResponse.text();
      throw new Error(`Fallback Gemini Flash failed: ${flashResponse.status} ${errText}`);
    }

    const flashData = await flashResponse.json();
    let svgContent = flashData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!svgContent) {
      throw new Error('No SVG generated');
    }

    // Clean up SVG content (remove markdown if present)
    svgContent = svgContent.replace(/```xml/g, '').replace(/```svg/g, '').replace(/```/g, '').trim();

    // Convert SVG to Base64
    // Using Deno's standard library for base64 encoding (imported at top)
    // We need to encode the string to bytes first
    const encoder = new TextEncoder();
    const data = encoder.encode(svgContent);
    const base64Svg = base64Encode(data);

    console.log('SVG generation successful');
    return new Response(
      JSON.stringify({ imageUrl: `data:image/svg+xml;base64,${base64Svg}` }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Edge Function Fatal Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
