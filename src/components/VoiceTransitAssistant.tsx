import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

interface TransitResult {
  busNumber: string;
  from: string;
  to: string;
  departureTime: string;
  duration: string;
  stops: number;
}

const VoiceTransitAssistant = () => {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [transitResults, setTransitResults] = useState<TransitResult[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState('hi');
  const recognitionRef = useRef<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Initialize speech recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = selectedLanguage === 'hi' ? 'hi-IN' : 'en-IN';

      recognitionRef.current.onstart = () => {
        setIsListening(true);
        console.log('Voice recognition started');
      };

      recognitionRef.current.onresult = (event: any) => {
        const spokenText = event.results[0][0].transcript;
        setTranscript(spokenText);
        console.log('Speech recognized:', spokenText);
        processVoiceQuery(spokenText);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        toast({
          title: "Voice recognition error",
          description: "Please try again or check your microphone permissions.",
          variant: "destructive"
        });
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
        console.log('Voice recognition ended');
      };
    }
  }, [selectedLanguage]);

  const startListening = () => {
    if (recognitionRef.current) {
      setTranscript('');
      setResponse('');
      setTransitResults([]);
      recognitionRef.current.start();
    } else {
      toast({
        title: "Voice not supported",
        description: "Your browser doesn't support voice recognition.",
        variant: "destructive"
      });
    }
  };

  const processVoiceQuery = async (query: string) => {
    setIsProcessing(true);
    
    try {
      const parsedQuery = await parseTransitQueryWithGemini(query);
      
      if (parsedQuery.origin && parsedQuery.destination) {
        const transitData = await fetchTransitData(parsedQuery.origin, parsedQuery.destination);
        
        if (transitData.length > 0) {
          setTransitResults(transitData);
          const responseText = await generateResponseWithGemini(transitData, selectedLanguage);
          setResponse(responseText);
          await speakResponse(responseText);
        } else {
          const noRouteMessage = selectedLanguage === 'hi' 
            ? "माफ करें, इस रूट के लिए कोई बस सेवा नहीं मिली।"
            : "Sorry, no bus service found for this route.";
          setResponse(noRouteMessage);
          await speakResponse(noRouteMessage);
        }
      } else {
        const errorMessage = selectedLanguage === 'hi' 
          ? "कृपया शुरुआती स्थान और गंतव्य दोनों बताएं"
          : "Please mention both starting location and destination";
        setResponse(errorMessage);
        await speakResponse(errorMessage);
      }
    } catch (error) {
      console.error('Error processing query:', error);
      const errorMessage = selectedLanguage === 'hi'
        ? "माफ करें, डेटा लाने में समस्या हुई है। कृपया दोबारा कोशिश करें।"
        : "Sorry, there was an issue fetching data. Please try again.";
      setResponse(errorMessage);
      await speakResponse(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const parseTransitQueryWithGemini = async (query: string) => {
    try {
      const GEMINI_API_KEY = 'AIzaSyBgd_nKRxaj3guXuOd40040-Hs4uJFgUNI';
      
      const prompt = `Parse this transit query and extract origin and destination locations. 
      Query: "${query}"
      
      Please respond with only a JSON object in this exact format:
      {"origin": "location1", "destination": "location2"}
      
      If you cannot identify both locations, use empty strings.`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }]
        })
      });

      if (response.ok) {
        const data = await response.json();
        const textResponse = data.candidates[0].content.parts[0].text;
        
        try {
          const parsed = JSON.parse(textResponse);
          return { origin: parsed.origin || '', destination: parsed.destination || '' };
        } catch {
          // Fallback to simple parsing
          return parseTransitQueryFallback(query);
        }
      } else {
        console.error('Gemini API error:', await response.text());
        return parseTransitQueryFallback(query);
      }
    } catch (error) {
      console.error('Error with Gemini API:', error);
      return parseTransitQueryFallback(query);
    }
  };

  const parseTransitQueryFallback = (query: string) => {
    // Simple parsing logic for fallback
    const lowerQuery = query.toLowerCase();
    let origin = '';
    let destination = '';
    
    // Look for common patterns
    const patterns = [
      /(.+?)\s+(?:se|से)\s+(.+?)\s+(?:tak|तक)/i,
      /(?:from|से)\s+(.+?)\s+(?:to|तक)\s+(.+)/i,
      /(.+?)\s+(?:to|तक)\s+(.+)/i
    ];
    
    for (const pattern of patterns) {
      const match = query.match(pattern);
      if (match) {
        origin = match[1].trim();
        destination = match[2].trim();
        break;
      }
    }
    
    return { origin, destination };
  };

  const fetchTransitData = async (origin: string, destination: string): Promise<TransitResult[]> => {
    try {
      // Wait for Google Maps to load
      if (!window.google) {
        throw new Error('Google Maps not loaded');
      }

      const directionsService = new window.google.maps.DirectionsService();
      
      const request: google.maps.DirectionsRequest = {
        origin: origin,
        destination: destination,
        travelMode: window.google.maps.TravelMode.TRANSIT,
        transitOptions: {
          modes: [window.google.maps.TransitMode.BUS],
          departureTime: new Date()
        },
        unitSystem: window.google.maps.UnitSystem.METRIC,
        region: 'IN'
      };

      return new Promise((resolve, reject) => {
        directionsService.route(request, (result, status) => {
          if (status === window.google.maps.DirectionsStatus.OK && result) {
            const routes = result.routes;
            if (routes && routes.length > 0) {
              const transitResults: TransitResult[] = [];
              
              routes[0].legs.forEach(leg => {
                leg.steps.forEach(step => {
                  if (step.travel_mode === window.google.maps.TravelMode.TRANSIT && 
                      step.transit && 
                      step.transit.line && 
                      step.transit.line.vehicle && 
                      step.transit.line.vehicle.type === window.google.maps.VehicleType.BUS) {
                    
                    transitResults.push({
                      busNumber: step.transit.line.short_name || step.transit.line.name || 'N/A',
                      from: step.transit.departure_stop.name,
                      to: step.transit.arrival_stop.name,
                      departureTime: step.transit.departure_time.text,
                      duration: step.duration.text,
                      stops: step.transit.num_stops || 0
                    });
                  }
                });
              });
              
              resolve(transitResults);
            } else {
              console.log('No routes found');
              resolve([]);
            }
          } else {
            console.error('Directions request failed:', status);
            resolve([]);
          }
        });
      });
      
    } catch (error) {
      console.error('Error with Google Maps API:', error);
      throw new Error('Failed to fetch transit data');
    }
  };

  const generateResponseWithGemini = async (transitData: TransitResult[], language: string): Promise<string> => {
    try {
      const GEMINI_API_KEY = 'AIzaSyBgd_nKRxaj3guXuOd40040-Hs4uJFgUNI';
      
      if (transitData.length === 0) {
        return language === 'hi' 
          ? "माफ करें, कोई बस मार्ग नहीं मिला।"
          : "Sorry, no bus routes found.";
      }
      
      const result = transitData[0];
      const prompt = `Generate a natural response about this bus route information in ${language === 'hi' ? 'Hindi' : 'English'}:
      
      Bus Number: ${result.busNumber}
      From: ${result.from}
      To: ${result.to}
      Departure Time: ${result.departureTime}
      Duration: ${result.duration}
      Stops: ${result.stops}
      
      Make it sound natural and conversational, like a helpful assistant.`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }]
        })
      });

      if (response.ok) {
        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
      } else {
        console.error('Gemini API error:', await response.text());
        // Fallback response
        if (language === 'hi') {
          return `बस नंबर ${result.busNumber} ${result.departureTime} में ${result.from} से छूटेगी। ${result.to} तक पहुंचने में ${result.duration} लगेंगे। इस रूट में कुल ${result.stops} स्टॉप हैं।`;
        } else {
          return `Bus number ${result.busNumber} will arrive in ${result.departureTime} from ${result.from}. It will take ${result.duration} to reach ${result.to} with ${result.stops} stops.`;
        }
      }
    } catch (error) {
      console.error('Error with Gemini API:', error);
      // Fallback response
      const result = transitData[0];
      if (language === 'hi') {
        return `बस नंबर ${result.busNumber} ${result.departureTime} में ${result.from} से छूटेगी। ${result.to} तक पहुंचने में ${result.duration} लगेंगे। इस रूट में कुल ${result.stops} स्टॉप हैं।`;
      } else {
        return `Bus number ${result.busNumber} will arrive in ${result.departureTime} from ${result.from}. It will take ${result.duration} to reach ${result.to} with ${result.stops} stops.`;
      }
    }
  };

  const speakResponse = async (text: string) => {
    try {
      // Use browser's built-in speech synthesis
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = selectedLanguage === 'hi' ? 'hi-IN' : 'en-IN';
      utterance.rate = 0.9;
      utterance.pitch = 1;
      speechSynthesis.speak(utterance);
    } catch (error) {
      console.error('Error with TTS:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-green-50 to-blue-100 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            🚌 Voice Transit Assistant
          </h1>
          <p className="text-lg text-gray-600">
            Ask about bus routes and travel time in your voice
          </p>
        </div>

        {/* Language Toggle */}
        <div className="flex justify-center mb-6">
          <div className="bg-white rounded-full p-1 shadow-md">
            <Button
              variant={selectedLanguage === 'hi' ? 'default' : 'ghost'}
              onClick={() => setSelectedLanguage('hi')}
              className="rounded-full px-6"
            >
              हिंदी
            </Button>
            <Button
              variant={selectedLanguage === 'en' ? 'default' : 'ghost'}
              onClick={() => setSelectedLanguage('en')}
              className="rounded-full px-6"
            >
              English
            </Button>
          </div>
        </div>

        {/* Voice Input Section */}
        <Card className="mb-6 shadow-lg">
          <CardContent className="p-8 text-center">
            <div className="mb-6">
              <div 
                className={`w-32 h-32 mx-auto rounded-full flex items-center justify-center text-6xl transition-all duration-300 ${
                  isListening 
                    ? 'bg-red-500 text-white animate-pulse scale-110' 
                    : isProcessing
                    ? 'bg-yellow-500 text-white animate-spin'
                    : 'bg-blue-500 text-white hover:bg-blue-600 cursor-pointer'
                }`}
                onClick={startListening}
              >
                {isListening ? '🎤' : isProcessing ? '⚙️' : '🎙️'}
              </div>
            </div>
            
            <Button
              onClick={startListening}
              disabled={isListening || isProcessing}
              size="lg"
              className="text-lg px-8 py-4 rounded-full"
            >
              {isListening 
                ? 'Listening...' 
                : isProcessing 
                ? 'Processing...' 
                : selectedLanguage === 'hi' 
                ? 'बोलना शुरू करें' 
                : 'Start Speaking'
              }
            </Button>
            
            <p className="text-sm text-gray-500 mt-4">
              {selectedLanguage === 'hi' 
                ? 'उदाहरण: "मैजेस्टिक से KR मार्केट तक कौन सी बस है?"'
                : 'Example: "Which bus goes from Majestic to KR Market?"'
              }
            </p>
          </CardContent>
        </Card>

        {/* Transcript Display */}
        {transcript && (
          <Card className="mb-6 bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <h3 className="font-semibold text-blue-800 mb-2">
                {selectedLanguage === 'hi' ? 'आपने कहा:' : 'You said:'}
              </h3>
              <p className="text-blue-700">{transcript}</p>
            </CardContent>
          </Card>
        )}

        {/* Response Display */}
        {response && (
          <Card className="mb-6 bg-green-50 border-green-200">
            <CardContent className="p-4">
              <h3 className="font-semibold text-green-800 mb-2">
                {selectedLanguage === 'hi' ? 'जवाब:' : 'Response:'}
              </h3>
              <p className="text-green-700 text-lg">{response}</p>
            </CardContent>
          </Card>
        )}

        {/* Transit Results Table */}
        {transitResults.length > 0 && (
          <Card className="shadow-lg">
            <CardContent className="p-6">
              <h3 className="text-xl font-semibold mb-4 text-gray-800">
                {selectedLanguage === 'hi' ? 'बस मार्ग विवरण:' : 'Bus Route Details:'}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border p-3 text-left">
                        {selectedLanguage === 'hi' ? 'बस नं.' : 'Bus No.'}
                      </th>
                      <th className="border p-3 text-left">
                        {selectedLanguage === 'hi' ? 'से' : 'From'}
                      </th>
                      <th className="border p-3 text-left">
                        {selectedLanguage === 'hi' ? 'तक' : 'To'}
                      </th>
                      <th className="border p-3 text-left">
                        {selectedLanguage === 'hi' ? 'छूटने का समय' : 'Departure'}
                      </th>
                      <th className="border p-3 text-left">
                        {selectedLanguage === 'hi' ? 'समय' : 'Duration'}
                      </th>
                      <th className="border p-3 text-left">
                        {selectedLanguage === 'hi' ? 'स्टॉप' : 'Stops'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {transitResults.map((result, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="border p-3 font-semibold text-blue-600">
                          {result.busNumber}
                        </td>
                        <td className="border p-3">{result.from}</td>
                        <td className="border p-3">{result.to}</td>
                        <td className="border p-3 text-green-600 font-medium">
                          {result.departureTime}
                        </td>
                        <td className="border p-3">{result.duration}</td>
                        <td className="border p-3">{result.stops}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center mt-8 text-gray-500">
          <p className="text-sm">
            {selectedLanguage === 'hi' 
              ? 'भारत के शहरी और अर्ध-शहरी क्षेत्रों के लिए बनाया गया'
              : 'Built for India\'s urban and semi-urban areas'
            }
          </p>
        </div>
      </div>
    </div>
  );
};

export default VoiceTransitAssistant;
