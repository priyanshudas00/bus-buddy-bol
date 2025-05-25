import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { MapPin, Navigation } from 'lucide-react';
import MapComponent from './MapComponent';
import LocationInput from './LocationInput';

interface TransitResult {
  busNumber: string;
  from: string;
  to: string;
  departureTime: string;
  duration: string;
  stops: number;
}

interface Location {
  lat: number;
  lng: number;
  address: string;
}

const VoiceTransitAssistant = () => {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [transitResults, setTransitResults] = useState<TransitResult[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState('hi');
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [fromLocation, setFromLocation] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [showMap, setShowMap] = useState(false);
  const recognitionRef = useRef<any>(null);
  const { toast } = useToast();

  const languages = [
    { code: 'hi', name: 'हिंदी', label: 'Hindi' },
    { code: 'mr', name: 'मराठी', label: 'Marathi' },
    { code: 'kn', name: 'ಕನ್ನಡ', label: 'Kannada' },
    { code: 'ta', name: 'தமிழ்', label: 'Tamil' },
    { code: 'te', name: 'తెలుగు', label: 'Telugu' },
    { code: 'en', name: 'English', label: 'English' }
  ];

  useEffect(() => {
    getCurrentLocation();
    initializeSpeechRecognition();
  }, [selectedLanguage]);

  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          try {
            const address = await reverseGeocode(latitude, longitude);
            setCurrentLocation({
              lat: latitude,
              lng: longitude,
              address: address
            });
            console.log('Current location:', address);
          } catch (error) {
            console.error('Error getting address:', error);
            setCurrentLocation({
              lat: latitude,
              lng: longitude,
              address: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
            });
          }
        },
        (error) => {
          console.error('Error getting location:', error);
          toast({
            title: "Location access denied",
            description: "Please allow location access for better experience.",
            variant: "destructive"
          });
        }
      );
    }
  };

  const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=AIzaSyA958dR9M1_2nML9OkxPk2e2eYZ_07XbBg`
      );
      const data = await response.json();
      if (data.results && data.results.length > 0) {
        return data.results[0].formatted_address;
      }
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
  };

  const initializeSpeechRecognition = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      
      // Set language for speech recognition
      const langMap: { [key: string]: string } = {
        'hi': 'hi-IN',
        'mr': 'mr-IN', 
        'kn': 'kn-IN',
        'ta': 'ta-IN',
        'te': 'te-IN',
        'en': 'en-IN'
      };
      recognitionRef.current.lang = langMap[selectedLanguage] || 'hi-IN';

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
  };

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
      
      let origin = parsedQuery.origin;
      let destination = parsedQuery.destination;

      // If no origin specified, use current location
      if (!origin && currentLocation) {
        origin = currentLocation.address;
      }

      if (origin && destination) {
        const transitData = await fetchTransitData(origin, destination);
        
        if (transitData.length > 0) {
          setTransitResults(transitData);
          const responseText = await generateResponseWithGemini(transitData, selectedLanguage);
          setResponse(responseText);
          await speakResponse(responseText);
        } else {
          const noRouteMessage = getNoRouteMessage(selectedLanguage);
          setResponse(noRouteMessage);
          await speakResponse(noRouteMessage);
        }
      } else {
        const errorMessage = getLocationErrorMessage(selectedLanguage);
        setResponse(errorMessage);
        await speakResponse(errorMessage);
      }
    } catch (error) {
      console.error('Error processing query:', error);
      const errorMessage = getProcessingErrorMessage(selectedLanguage);
      setResponse(errorMessage);
      await speakResponse(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const getNoRouteMessage = (lang: string): string => {
    const messages: { [key: string]: string } = {
      'hi': "माफ करें, इस रूट के लिए कोई बस सेवा नहीं मिली।",
      'mr': "माफ करा, या मार्गासाठी कोणतीही बस सेवा सापडली नाही।",
      'kn': "ಕ್ಷಮಿಸಿ, ಈ ಮಾರ್ಗಕ್ಕೆ ಯಾವುದೇ ಬस್ ಸೇವೆ ಸಿಗಲಿಲ್ಲ।",
      'ta': "மன்னிக்கவும், இந்த வழிக்கு எந்த பேருந்து சேவையும் கிடைக்கவில்லை।",
      'te': "క్షమించండి, ఈ రూట్ కోసం ఏ బస్ సేవ కనుగొనబడలేదు।",
      'en': "Sorry, no bus service found for this route."
    };
    return messages[lang] || messages['en'];
  };

  const getLocationErrorMessage = (lang: string): string => {
    const messages: { [key: string]: string } = {
      'hi': "कृपया शुरुआती स्थान और गंतव्य दोनों बताएं",
      'mr': "कृपया प्रारंभिक स्थान आणि गंतव्य दोन्ही सांगा",
      'kn': "ದಯವಿಟ್ಟು ಆರಂಭಿಕ ಸ್ಥಳ ಮತ್ತು ಗಮ್ಯಸ್ಥಾನ ಎರಡನ್ನೂ ಹೇಳಿ",
      'ta': "தயவுசெய்து தொடக்க இடம் மற்றும் சேருமிடம் இரண்டையும் கூறுங்கள்",
      'te': "దయచేసి ప్రారంభ స్థలం మరియు గమ్యస్థానం రెండింటినీ చెప్పండి",
      'en': "Please mention both starting location and destination"
    };
    return messages[lang] || messages['en'];
  };

  const getProcessingErrorMessage = (lang: string): string => {
    const messages: { [key: string]: string } = {
      'hi': "माफ करें, डेटा लाने में समस्या हुई है। कृपया दोबारा कोशिश करें।",
      'mr': "माफ करा, डेटा आणण्यात समस्या आली आहे. कृपया पुन्हा प्रयत्न करा.",
      'kn': "ಕ್ಷಮಿಸಿ, ಡೇಟಾ ತರುವಲ್ಲಿ ಸಮಸ್ಯೆ ಇದೆ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
      'ta': "மன்னிக்கவும், தரவு பெறுவதில் சிக்கல் உள்ளது. தயவுசெய்து மீண்டும் முயற்சிக்கவும்.",
      'te': "క్షమించండి, డేటా తీసుకురావడంలో సమస్య ఉంది. దయచేసి మళ్లీ ప్రయత్నించండి.",
      'en': "Sorry, there was an issue fetching data. Please try again."
    };
    return messages[lang] || messages['en'];
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
    const lowerQuery = query.toLowerCase();
    let origin = '';
    let destination = '';
    
    const patterns = [
      /(.+?)\s+(?:se|से|पासून|नಿಂದ|இருந்து|నుండి|from)\s+(.+?)\s+(?:tak|तक|पर्यंत|ವರೆಗೆ|வரை|వరకు|to)/i,
      /(?:from|से|पासून|नಿಂದ|இருந்து|నుండి)\s+(.+?)\s+(?:to|तक|पर्यंत|ವರೆಗೆ|வரை|వరకు)\s+(.+)/i,
      /(.+?)\s+(?:to|तक|पर्यंत|ವರೆಗೆ|வரை|వరకు)\s+(.+)/i
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
        return getNoRouteMessage(language);
      }
      
      const result = transitData[0];
      const languageNames: { [key: string]: string } = {
        'hi': 'Hindi',
        'mr': 'Marathi', 
        'kn': 'Kannada',
        'ta': 'Tamil',
        'te': 'Telugu',
        'en': 'English'
      };

      const prompt = `Generate a natural response about this bus route information in ${languageNames[language] || 'Hindi'}:
      
      Bus Number: ${result.busNumber}
      From: ${result.from}
      To: ${result.to}
      Departure Time: ${result.departureTime}
      Duration: ${result.duration}
      Stops: ${result.stops}
      
      Make it sound natural and conversational, like a helpful female assistant.`;

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
        return getFallbackResponse(result, language);
      }
    } catch (error) {
      console.error('Error with Gemini API:', error);
      return getFallbackResponse(transitData[0], language);
    }
  };

  const getFallbackResponse = (result: TransitResult, language: string): string => {
    const responses: { [key: string]: string } = {
      'hi': `बस नंबर ${result.busNumber} ${result.departureTime} में ${result.from} से छूटेगी। ${result.to} तक पहुंचने में ${result.duration} लगेंगे। इस रूट में कुल ${result.stops} स्टॉप हैं।`,
      'mr': `बस नंबर ${result.busNumber} ${result.departureTime} मध्ये ${result.from} येथून सुटेल. ${result.to} पर्यंत पोहोचण्यास ${result.duration} लागतील. या मार्गावर एकूण ${result.stops} थांबे आहेत.`,
      'kn': `ಬಸ್ ಸಂಖ್ಯೆ ${result.busNumber} ${result.departureTime} ನಲ್ಲಿ ${result.from} ನಿಂದ ಹೊರಡುತ್ತದೆ. ${result.to} ತಲುಪಲು ${result.duration} ಸಮಯ ತೆಗೆದುಕೊಳ್ಳುತ್ತದೆ. ಈ ಮಾರ್ಗದಲ್ಲಿ ಒಟ್ಟು ${result.stops} ನಿಲ್ದಾಣಗಳಿವೆ.`,
      'ta': `பேருந்து எண் ${result.busNumber} ${result.departureTime} இல் ${result.from} இலிருந்து புறப்படும். ${result.to} சென்றடைய ${result.duration} நேரம் ஆகும். இந்த வழியில் மொத்தம் ${result.stops} நிறுத்தங்கள் உள்ளன.`,
      'te': `బస్ నంబర్ ${result.busNumber} ${result.departureTime} లో ${result.from} నుండి బయలుదేరుతుంది. ${result.to} చేరుకోవడానికి ${result.duration} సమయం పడుతుంది. ఈ రూట్ కోసం ఏ బస్ సేవ కనుగొనబడలేదు.`,
      'en': `Bus number ${result.busNumber} will arrive in ${result.departureTime} from ${result.from}. It will take ${result.duration} to reach ${result.to} with ${result.stops} stops.`
    };
    return responses[language] || responses['en'];
  };

  const speakResponse = async (text: string) => {
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Set language for TTS
      const langMap: { [key: string]: string } = {
        'hi': 'hi-IN',
        'mr': 'mr-IN',
        'kn': 'kn-IN', 
        'ta': 'ta-IN',
        'te': 'te-IN',
        'en': 'en-IN'
      };
      utterance.lang = langMap[selectedLanguage] || 'hi-IN';
      
      // Try to select a female voice
      const voices = speechSynthesis.getVoices();
      const femaleVoice = voices.find(voice => 
        voice.lang.startsWith(langMap[selectedLanguage] || 'hi') && 
        (voice.name.toLowerCase().includes('female') || 
         voice.name.toLowerCase().includes('woman') ||
         voice.name.toLowerCase().includes('girl') ||
         !voice.name.toLowerCase().includes('male'))
      );
      
      if (femaleVoice) {
        utterance.voice = femaleVoice;
      }
      
      utterance.rate = 0.9;
      utterance.pitch = 1.1; // Slightly higher pitch for female voice
      speechSynthesis.speak(utterance);
    } catch (error) {
      console.error('Error with TTS:', error);
    }
  };

  const handleManualSearch = async () => {
    if (!fromLocation || !toLocation) {
      toast({
        title: "Missing locations",
        description: "Please enter both from and to locations.",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    try {
      const transitData = await fetchTransitData(fromLocation, toLocation);
      
      if (transitData.length > 0) {
        setTransitResults(transitData);
        const responseText = await generateResponseWithGemini(transitData, selectedLanguage);
        setResponse(responseText);
        await speakResponse(responseText);
      } else {
        const noRouteMessage = getNoRouteMessage(selectedLanguage);
        setResponse(noRouteMessage);
        await speakResponse(noRouteMessage);
      }
    } catch (error) {
      console.error('Error in manual search:', error);
      const errorMessage = getProcessingErrorMessage(selectedLanguage);
      setResponse(errorMessage);
      await speakResponse(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-green-50 to-blue-100 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            🚌 Voice Transit Assistant
          </h1>
          <p className="text-lg text-gray-600">
            Ask about bus routes and travel time in your voice
          </p>
        </div>

        {/* Language Selection */}
        <div className="flex justify-center mb-6">
          <div className="bg-white rounded-full p-1 shadow-md flex flex-wrap gap-1">
            {languages.map((lang) => (
              <Button
                key={lang.code}
                variant={selectedLanguage === lang.code ? 'default' : 'ghost'}
                onClick={() => setSelectedLanguage(lang.code)}
                className="rounded-full px-3 py-1 text-sm"
                size="sm"
              >
                {lang.name}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Voice Input and Manual Input */}
          <div className="space-y-6">
            {/* Current Location Display */}
            {currentLocation && (
              <Card className="bg-green-50 border-green-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-green-600" />
                    <div>
                      <h3 className="font-semibold text-green-800">Current Location</h3>
                      <p className="text-green-700 text-sm">{currentLocation.address}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Voice Input Section */}
            <Card className="shadow-lg">
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
                    : languages.find(l => l.code === selectedLanguage)?.code === 'en'
                    ? 'Start Speaking' 
                    : 'बोलना शुरू करें'
                  }
                </Button>
              </CardContent>
            </Card>

            {/* Manual Location Input */}
            <Card className="shadow-lg">
              <CardContent className="p-6">
                <h3 className="text-xl font-semibold mb-4 text-gray-800">
                  {selectedLanguage === 'en' ? 'Manual Search' : 'मैन्युअल खोज'}
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {selectedLanguage === 'en' ? 'From' : 'से'}
                    </label>
                    <div className="relative">
                      <Input
                        value={fromLocation}
                        onChange={(e) => setFromLocation(e.target.value)}
                        placeholder={selectedLanguage === 'en' ? 'Enter starting location' : 'शुरुआती स्थान दर्ज करें'}
                        className="pl-10"
                      />
                      <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    </div>
                    {currentLocation && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setFromLocation(currentLocation.address)}
                        className="mt-1 text-xs"
                      >
                        Use current location
                      </Button>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {selectedLanguage === 'en' ? 'To' : 'तक'}
                    </label>
                    <div className="relative">
                      <Input
                        value={toLocation}
                        onChange={(e) => setToLocation(e.target.value)}
                        placeholder={selectedLanguage === 'en' ? 'Enter destination' : 'गंतव्य दर्ज करें'}
                        className="pl-10"
                      />
                      <Navigation className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    </div>
                  </div>
                  <Button
                    onClick={handleManualSearch}
                    disabled={isProcessing}
                    className="w-full"
                  >
                    {isProcessing ? 'Searching...' : selectedLanguage === 'en' ? 'Search Routes' : 'रूट खोजें'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Map and Results */}
          <div className="space-y-6">
            {/* Map Toggle and Display */}
            <Card className="shadow-lg">
              <CardContent className="p-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold">
                    {selectedLanguage === 'en' ? 'Map View' : 'मैप दृश्य'}
                  </h3>
                  <Button
                    variant={showMap ? 'default' : 'outline'}
                    onClick={() => setShowMap(!showMap)}
                    size="sm"
                  >
                    {showMap ? 'Hide Map' : 'Show Map'}
                  </Button>
                </div>
                {showMap && <MapComponent currentLocation={currentLocation} />}
              </CardContent>
            </Card>

            {/* Transcript Display */}
            {transcript && (
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-4">
                  <h3 className="font-semibold text-blue-800 mb-2">
                    {selectedLanguage === 'en' ? 'You said:' : 'आपने कहा:'}
                  </h3>
                  <p className="text-blue-700">{transcript}</p>
                </CardContent>
              </Card>
            )}

            {/* Response Display */}
            {response && (
              <Card className="bg-green-50 border-green-200">
                <CardContent className="p-4">
                  <h3 className="font-semibold text-green-800 mb-2">
                    {selectedLanguage === 'en' ? 'Response:' : 'जवाब:'}
                  </h3>
                  <p className="text-green-700 text-lg">{response}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Transit Results Table */}
        {transitResults.length > 0 && (
          <Card className="shadow-lg mt-6">
            <CardContent className="p-6">
              <h3 className="text-xl font-semibold mb-4 text-gray-800">
                {selectedLanguage === 'en' ? 'Bus Route Details:' : 'बस मार्ग विवरण:'}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border p-3 text-left">
                        {selectedLanguage === 'en' ? 'Bus No.' : 'बस नं.'}
                      </th>
                      <th className="border p-3 text-left">
                        {selectedLanguage === 'en' ? 'From' : 'से'}
                      </th>
                      <th className="border p-3 text-left">
                        {selectedLanguage === 'en' ? 'To' : 'तक'}
                      </th>
                      <th className="border p-3 text-left">
                        {selectedLanguage === 'en' ? 'Departure' : 'छूटने का समय'}
                      </th>
                      <th className="border p-3 text-left">
                        {selectedLanguage === 'en' ? 'Duration' : 'समय'}
                      </th>
                      <th className="border p-3 text-left">
                        {selectedLanguage === 'en' ? 'Stops' : 'स्टॉप'}
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
            {selectedLanguage === 'en' 
              ? 'Built for India\'s urban and semi-urban areas'
              : 'भारत के शहरी और अर्ध-शहरी क्षेत्रों के लिए बनाया गया'
            }
          </p>
        </div>
      </div>
    </div>
  );
};

export default VoiceTransitAssistant;
