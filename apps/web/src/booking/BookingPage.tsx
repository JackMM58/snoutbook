import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { sizeForWeight, type PlanId, type Service, type Size } from '@snoutbook/shared';
import { useApi } from '../api/hooks';
import { ErrorNote, Loading } from '../components/ui';
import { DetailsStep } from './DetailsStep';
import { PetStep } from './PetStep';
import { ServiceStep } from './ServiceStep';
import { TimeStep } from './TimeStep';
import './booking.css';

export interface PublicBusiness {
  name: string;
  slug: string;
  plan: PlanId;
  timezone: string;
  phone: string | null;
  depositCents: number | null;
  collectsAddress: boolean;
}

export interface BookingInfo {
  business: PublicBusiness;
  services: Service[];
  groomers: { id: string; name: string }[];
}

export type PetChoice =
  | { kind: 'existing'; id: string; name: string; size: Size }
  | { kind: 'new'; name: string; breed: string; weightLbs: number };

export interface ReturningClient {
  firstName: string;
  phone: string;
  email: string;
}

export interface ChosenSlot {
  startsAt: string;
  groomerId: string;
  /** What the client picked: a groomer id or 'any'. */
  groomerChoice: string;
}

type Step = 'service' | 'pet' | 'time' | 'details';

export function petSize(pet: PetChoice): Size {
  return pet.kind === 'existing' ? pet.size : sizeForWeight(pet.weightLbs);
}

export function BookingPage() {
  const { slug = '' } = useParams();
  const { data, error, loading } = useApi<BookingInfo>(`/public/${slug}`);
  const [step, setStep] = useState<Step>('service');
  const [service, setService] = useState<Service>();
  const [pet, setPet] = useState<PetChoice>();
  const [returning, setReturning] = useState<ReturningClient>();
  const [slot, setSlot] = useState<ChosenSlot>();

  if (loading) return <div className="booking"><Loading /></div>;
  if (error || !data) {
    return (
      <div className="booking">
        <ErrorNote error={error ?? 'This booking page is not available.'} />
      </div>
    );
  }

  const { business, services, groomers } = data;

  return (
    <div className="booking">
      <header className="booking-header">
        <h1>{business.name}</h1>
        <p className="muted">Book a groom online{business.phone ? ` · ${business.phone}` : ''}</p>
      </header>

      <main className="booking-body">
        {step === 'service' && (
          <ServiceStep
            services={services}
            selectedId={service?.id}
            onSelect={(s) => {
              setService(s);
              setSlot(undefined);
              setStep('pet');
            }}
          />
        )}
        {step === 'pet' && (
          <PetStep
            slug={slug}
            initialPet={pet}
            initialReturning={returning}
            onContinue={(chosen, client) => {
              setPet(chosen);
              setReturning(client);
              setSlot(undefined);
              setStep('time');
            }}
          />
        )}
        {step === 'time' && service && pet && (
          <TimeStep
            slug={slug}
            business={business}
            service={service}
            size={petSize(pet)}
            groomers={groomers}
            selected={slot}
            onSelect={(chosen) => {
              setSlot(chosen);
              setStep('details');
            }}
          />
        )}
        {step === 'details' && service && pet && slot && (
          <DetailsStep
            slug={slug}
            business={business}
            service={service}
            pet={pet}
            slot={slot}
            groomerName={groomers.find((g) => g.id === slot.groomerId)?.name}
            returning={returning}
            onSlotTaken={() => {
              setSlot(undefined);
              setStep('time');
            }}
          />
        )}
      </main>
    </div>
  );
}
