
declare global {
  interface Window {
    google: typeof google;
  }
}

declare namespace google {
  namespace maps {
    class DirectionsService {
      route(
        request: DirectionsRequest,
        callback: (result: DirectionsResult | null, status: DirectionsStatus) => void
      ): void;
    }

    interface DirectionsRequest {
      origin: string;
      destination: string;
      travelMode: TravelMode;
      transitOptions?: TransitOptions;
      unitSystem?: UnitSystem;
      region?: string;
    }

    interface DirectionsResult {
      routes: DirectionsRoute[];
    }

    interface DirectionsRoute {
      legs: DirectionsLeg[];
    }

    interface DirectionsLeg {
      steps: DirectionsStep[];
    }

    interface DirectionsStep {
      travel_mode: TravelMode;
      transit?: TransitDetails;
      duration: Duration;
    }

    interface TransitDetails {
      line: TransitLine;
      departure_stop: TransitStop;
      arrival_stop: TransitStop;
      departure_time: Time;
      num_stops: number;
    }

    interface TransitLine {
      short_name?: string;
      name?: string;
      vehicle: TransitVehicle;
    }

    interface TransitVehicle {
      type: VehicleType;
    }

    interface TransitStop {
      name: string;
    }

    interface Time {
      text: string;
    }

    interface Duration {
      text: string;
    }

    interface TransitOptions {
      modes: TransitMode[];
      departureTime: Date;
    }

    enum TravelMode {
      TRANSIT = 'TRANSIT'
    }

    enum TransitMode {
      BUS = 'BUS'
    }

    enum VehicleType {
      BUS = 'BUS'
    }

    enum DirectionsStatus {
      OK = 'OK'
    }

    enum UnitSystem {
      METRIC = 'METRIC'
    }
  }
}
