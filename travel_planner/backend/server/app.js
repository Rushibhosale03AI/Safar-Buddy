// --- 1. SETUP MODULES ---
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleGenAI } = require('@google/genai');
const axios = require('axios'); // Used for making HTTP requests (like Python's 'requests')
const fs = require('fs'); // Used for file system operations (like Python's 'os' for file handling)
const path = require('path');
const { date } = require('joi'); // Not strictly needed, but included for completeness, though we'll use Date object directly
const { format } = require('date-fns'); // A popular library for date formatting

// Load environment variables from .env file
dotenv.config();

const app = express();
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.json()); // Middleware to parse JSON request bodies (like Flask's request.get_json())

// --- 2. CONFIGURE API KEYS ---
// In Node.js, environment variables are accessed via process.env
const geminiApiKey = process.env.GEMINI_API_KEY;
const googleApiKey = process.env.GOOGLE_API_KEY;
const searchEngineId = process.env.SEARCH_ENGINE_ID;

if (!geminiApiKey || !googleApiKey || !searchEngineId) {
    console.error("Configuration Error: One or more required API keys are missing from the .env file.");
    // In a real server, you might not exit, but return a 500 error on the route.
    // For setup failure, exiting is fine.
    process.exit(1); 
}

const ai = new GoogleGenAI(geminiApiKey);

// --- 3. RATE LIMITING SETUP ---
const USAGE_FILE = path.join(__dirname, 'api_usage.json');
const DAILY_LIMIT = 95; // Set the daily limit

/**
 * Reads the usage data from the JSON file.
 * @returns {object}
 */
const getApiUsage = () => {
    try {
        const data = fs.readFileSync(USAGE_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        // If file doesn't exist or is empty/invalid, start fresh
        return { date: format(new Date(), 'yyyy-MM-dd'), count: 0 };
    }
};

/**
 * Saves the usage data to the JSON file.
 * @param {object} usageData 
 */
const saveApiUsage = (usageData) => {
    fs.writeFileSync(USAGE_FILE, JSON.stringify(usageData, null, 2), 'utf8');
};

// --- 4. ASYNC FUNCTION TO FETCH IMAGES ---
/**
 * Fetches a single, high-quality, and DIRECT image URL for a given location,
 * while respecting the daily limit.
 * @param {string} locationName 
 * @returns {Promise<object | null>}
 */
const fetchImagesForLocation = async (locationName) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    let usage = getApiUsage();

    // Reset counter if it's a new day
    if (usage.date !== today) {
        usage = { date: today, count: 0 };
    }
    
    // Check limit
    if (usage.count >= DAILY_LIMIT) {
        console.log(`Daily image search limit of ${DAILY_LIMIT} reached.`);
        return null;
    }

    if (!locationName) {
        return null;
    }

    const searchUrl = "https://www.googleapis.com/customsearch/v1";
    const improvedQuery = `scenic travel photo of ${locationName}`;
    
    const params = {
        key: googleApiKey,
        cx: searchEngineId,
        q: improvedQuery,
        searchType: 'image',
        num: 5,
        imgSize: 'huge',
        safe: 'high'
    };

    try {
        // Use axios (Node.js equivalent of Python requests library)
        const response = await axios.get(searchUrl, { params: params });
        
        // --- Increment and save the count after each API call ---
        usage.count += 1;
        saveApiUsage(usage);
        console.log(`Google Search API call count for today: ${usage.count}/${DAILY_LIMIT}`);

        const data = response.data;

        if (data.items) {
            for (const item of data.items) {
                const fileFormat = item.fileFormat?.toLowerCase();
                if (fileFormat && ['image/jpeg', 'image/png', 'image/webp'].includes(fileFormat)) {
                    console.log(`Found direct image link: ${item.link}`);
                    return {
                        url: item.link,
                        description: item.title
                    };
                }
            }
            console.log("No direct image file found in search results.");
            return null;
        }
    } catch (error) {
        if (error.response) {
            console.error(`Error fetching images from Google Search. Status: ${error.response.status}, Data:`, error.response.data);
        } else {
            console.error(`Error fetching images from Google Search: ${error.message}`);
        }
    }

    return null;
};


// --- 5. EXPRESS ROUTE AND ASYNC MODEL LOGIC ---
const MODEL_FALLBACK_ORDER = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-pro-latest'];

// Use 'async' for the route handler to use 'await'
app.post("/api/generate-itinerary", async (req, res) => {
    const { prompt } = req.body; // Express uses req.body after using express.json()
    
    if (!prompt) {
        return res.status(400).json({ error: "Prompt is missing" });
    }

    const userPrompt = prompt;
    
    // The model_prompt content remains the same
    const modelPrompt = `
    You are **SufferBuddy**, an expert AI travel guide for India. 
    You create clean, practical, attractive, and highly detailed travel itineraries in **simple English**.
    You must include **hotel prices, food prices, timings, must-try dishes, transport costs, and nearby famous places**.
    Do NOT use empty bullet points, avoid unnecessary newlines, and keep formatting clean.

    # 1. USER ANALYSIS
    Study the user's request and detect:
    - Travel style (solo, family, friends, couple, business, backpacker)
    - Budget level (luxury, mid-range, budget) — infer if not mentioned
    - Trip duration
    - Special interests (adventure, food, temples, beaches, nightlife, culture, photography)
    All suggestions must match the user's travel style and interests.

    # 2. ITINERARY FORMAT

    ## Title
    A catchy Level-1 Markdown heading.

    ## Introduction
    A short friendly paragraph that sets the tone of the trip.

    ## Trip Style
    A single sentence such as:
    **Trip Style:** Perfect for a family adventure with comfort and safety.

    ## Main Map
    A Google Maps link to the main destination:
    [View on Google Maps](https://www.google.com/maps/search/?api=1&query=[Main Destination])

    # 3. DAILY PLAN FORMAT (Repeat for each day)

    ## Day X: [Short Theme]
    One simple line describing the day’s theme.

    ### [Location Name]
    - A short description of the location.
    - Add: [IMAGE: {{Location name for image search}}]

    ### Local Guide
    - **Transport:** Mention common options + approx cost (Auto: ₹150–200, Cab: ₹300–500).
    - **Stay:** Recommend 1 luxury + 1 budget hotel with approx per-night prices.
    - **Food:** Suggest breakfast/lunch/dinner spots with must-try dishes and approx price per person.
    - **Activities:** List 2–4 activities with:
        - Entry fees (₹)
        - Best timings
        - Approx duration
    - **Nearby Places:** List 1–2 close famous places with short notes.

    # 4. END SECTION — TRAVEL HUB

    ## How to Reach [Main Destination]
    Provide the following links:
    - **Flights:** [Search Flights](https://www.google.com/flights?q=flights+to+[Main Destination])
    - **Trains:** [Train Availability](https://www.irctc.co.in/nget/train-search)
    - **Buses:** [Bus Tickets](https://www.redbus.in/buses/[main-destination]-bus-tickets)

    # 5. RULES
    - Use simple English only.
    - Keep formatting clean and readable.
    - Do not use empty lists or empty points.
    - Add prices wherever possible (food, hotels, activities, transport).

    ----------------------------------------------------------
    **User Request:** "${userPrompt}"
    ----------------------------------------------------------

    # Begin the itinerary below:
    `;

    let lastError = null;
    for (const modelName of MODEL_FALLBACK_ORDER) {
        try {
            console.log(`Attempting to use model: ${modelName}`);

            // Use the client library object for configuration and content generation
            const response = await ai.models.generateContent({
                model: modelName.trim(), // Use trim() to clean up spacing from list
                contents: [{ role: 'user', parts: [{ text: modelPrompt }] }],
            });

            let itineraryText = response.text;
            
            // Regex for finding placeholders
            const imagePlaceholders = itineraryText.match(/\[IMAGE: (.*?)\]/g) || [];
            console.log(`Found ${imagePlaceholders.length} image placeholders.`);
            
            const usedUrls = new Set();
            
            // Process placeholders sequentially
            for (const placeholderMatch of imagePlaceholders) {
                // Extract the location name from the placeholder
                const locationToSearchMatch = placeholderMatch.match(/\[IMAGE: (.*?)\]/);
                const locationToSearch = locationToSearchMatch ? locationToSearchMatch[1].trim() : '';

                const imageData = await fetchImagesForLocation(locationToSearch);
                
                if (imageData && !usedUrls.has(imageData.url)) {
                    // Create Markdown image link
                    const imageMarkdown = `![${imageData.description || locationToSearch}](${imageData.url})`;
                    
                    // Replace the first occurrence of the specific placeholder
                    itineraryText = itineraryText.replace(placeholderMatch, imageMarkdown);
                    usedUrls.add(imageData.url);
                } else {
                    // Remove the placeholder if no image was found or URL was a duplicate
                    itineraryText = itineraryText.replace(placeholderMatch, "");
                }
            }
            
            // --- Clean up extra spacing and empty lines ---
            // Remove any lines that are just a bullet point (* or -)
            itineraryText = itineraryText.replace(/^[\s\*-]*$/gm, '');
            // Collapse more than two newlines into a maximum of two
            itineraryText = itineraryText.replace(/\n{3,}/g, '\n\n');

            console.log(`Successfully generated and enhanced content with ${modelName}`);
            return res.json({ itinerary: itineraryText.trim() });

        } catch (error) {
            console.error(`Error with model ${modelName}:`, error.message);
            lastError = error.message;
            continue; // Try the next model in the fallback list
        }
    }

    console.log("All models failed to generate a response.");
    return res.status(503).json({
        error: "Failed to generate itinerary. All models are currently busy or an error occurred.",
        details: lastError
    });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`Node.js/Express server running on port ${PORT}`);
});