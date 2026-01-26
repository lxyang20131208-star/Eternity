// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
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

    // Get Gemini API key from environment
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    // Enhance prompt with book context
    const enhancedPrompt = `Create a professional book cover image. Book title: "${bookTitle}", Author: "${authorName}".
User's description: ${prompt}.
Style: Professional, suitable for print, high quality, visually appealing.
The image should work well as a background for a book cover with text overlays.`;

    console.log('Generating image with prompt:', enhancedPrompt);

    // Call Gemini API for image generation using Imagen 3
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:generate?key=${geminiApiKey}`;

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: enhancedPrompt,
        number_of_images: 1,
        aspect_ratio: '3:4', // Good for book covers
        safety_filter_level: 'block_some',
        person_generation: 'allow_adult',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', errorText);
      throw new Error(`Gemini API failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();

    if (!data.generated_images || data.generated_images.length === 0) {
      throw new Error('No image generated');
    }

    // The image is returned as base64 in the response
    const imageData = data.generated_images[0];
    const imageBase64 = imageData.image.image_bytes || imageData.image;

    // Return the image as data URL
    const imageUrl = `data:image/png;base64,${imageBase64}`;

    return new Response(
      JSON.stringify({ imageUrl }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error generating cover image:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to generate image' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
