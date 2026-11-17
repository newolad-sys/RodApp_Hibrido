import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonList,
  IonItem,
  IonInput,
  IonButton,
  IonSelect,
  IonSelectOption,
  IonCheckbox,
  IonSpinner,
  IonIcon,
} from '@ionic/angular/standalone';

import { MotosService } from '@core/services/motos.service';
import { NotificationService } from '@core/services/notification.service';
import { RuntError, RuntService } from '@core/services/runt.service';
import { SupabaseService } from '@core/services/supabase.service';
import { RuntResumen, TipoDocumentoRunt } from '@core/models/models';

/**
 * Frame Figma "Registro de moto" (seccion 3.3 de `mockups/VISTAS.md`).
 *
 * Alta de una motocicleta: marca, modelo, placa, cilindrada y odometro
 * inicial. Es el prerequisito para poder usar los formularios de
 * combustible, mantenimiento, SOAT y RTM (todos requieren un `moto_id`).
 *
 * Opcionalmente autocompleta los datos desde el RUNT (placa + documento del
 * propietario, via `RuntService`) y, si el RUNT trae SOAT/RTM, los guarda
 * junto con la moto.
 */
@Component({
  selector: 'app-moto-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonList,
    IonItem,
    IonInput,
    IonButton,
    IonSelect,
    IonSelectOption,
    IonCheckbox,
    IonSpinner,
    IonIcon,
  ],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/app/garaje" text=""></ion-back-button>
        </ion-buttons>
        <ion-title>Registro de tu moto</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content [fullscreen]="true">
      <form class="rod-container moto-form" [formGroup]="form" (ngSubmit)="guardar()">
        <!-- Cabecera del Figma "Registro de tu Moto" -->
        <header class="intro">
          <span class="intro-icon"><ion-icon name="bicycle" aria-hidden="true"></ion-icon></span>
          <h1>Detalles de tu máquina</h1>
          <p>Ingresa los datos para empezar el seguimiento de mantenimiento y rendimiento.</p>
        </header>

        <ion-list lines="none" class="campos">
          <ion-item class="rod-card">
            <ion-input
              formControlName="placa"
              label="Placa"
              labelPlacement="stacked"
              placeholder="Ej. ABC12D"
            ></ion-input>
          </ion-item>
        </ion-list>

        <!-- Autocompletar desde el RUNT (opcional) -->
        <section class="rod-card runt" [formGroup]="runtForm">
          <h2>Autocompletar con el RUNT</h2>
          <p class="ayuda">
            Opcional. Con la placa y el documento del propietario traemos marca,
            modelo, cilindrada, SOAT y revision tecnomecanica.
          </p>

          <ion-list lines="none" class="campos">
            <ion-item>
              <ion-select
                formControlName="docType"
                label="Tipo de documento"
                labelPlacement="stacked"
                interface="action-sheet"
              >
                @for (tipo of tiposDoc; track tipo.valor) {
                  <ion-select-option [value]="tipo.valor">{{ tipo.etiqueta }}</ion-select-option>
                }
              </ion-select>
            </ion-item>
            <ion-item>
              <ion-input
                formControlName="docNumber"
                inputmode="numeric"
                label="Documento del propietario"
                labelPlacement="stacked"
                placeholder="Sin puntos"
              ></ion-input>
            </ion-item>
          </ion-list>

          <ion-button
            type="button"
            expand="block"
            fill="outline"
            [disabled]="consultando() || !puedeConsultar()"
            (click)="consultarRunt()"
          >
            @if (consultando()) {
              <ion-spinner name="crescent"></ion-spinner>
            } @else {
              Consultar RUNT
            }
          </ion-button>

          @if (runt(); as r) {
            <div class="resultado">
              <p>
                <strong>{{ r.vehiculo.marca }} {{ r.vehiculo.linea }}</strong>
                {{ r.vehiculo.modelo }} · {{ r.vehiculo.color }} · {{ r.vehiculo.estado }}
              </p>
              <p>
                SOAT:
                @if (r.soat) {
                  {{ r.soat.aseguradora }}, vence {{ r.soat.fechaVencimiento }}
                  ({{ r.soat.vigente ? 'vigente' : 'vencido' }})
                } @else {
                  sin registro
                }
              </p>
              <p>
                RTM:
                @if (r.rtm) {
                  {{ r.rtm.cda }}, vence {{ r.rtm.fechaVencimiento }}
                  ({{ r.rtm.vigente ? 'vigente' : 'vencida' }})
                } @else {
                  sin registro
                }
              </p>
              @for (alerta of r.alertas; track alerta) {
                <p class="alerta">⚠ {{ alerta }}</p>
              }
              @if (r.soat || r.rtm) {
                <ion-checkbox
                  labelPlacement="end"
                  [checked]="guardarDocumentos()"
                  (ionChange)="guardarDocumentos.set($event.detail.checked)"
                >
                  Guardar tambien SOAT y RTM
                </ion-checkbox>
              }
            </div>
          }
        </section>

        <ion-list lines="none" class="campos">
          <ion-item class="rod-card">
            <ion-input
              formControlName="marca"
              label="Marca"
              labelPlacement="stacked"
              placeholder="Ej. Yamaha"
            ></ion-input>
          </ion-item>

          <ion-item class="rod-card">
            <ion-input
              formControlName="modelo"
              label="Modelo"
              labelPlacement="stacked"
              placeholder="Ej. FZ 2.0"
            ></ion-input>
          </ion-item>

          <ion-item class="rod-card">
            <ion-input
              formControlName="cilindrada"
              type="number"
              inputmode="numeric"
              label="Cilindrada (cc)"
              labelPlacement="stacked"
              placeholder="Opcional"
            ></ion-input>
          </ion-item>

          <ion-item class="rod-card">
            <ion-input
              formControlName="odometroInicial"
              type="number"
              inputmode="numeric"
              label="Kilometraje actual"
              labelPlacement="stacked"
              placeholder="0"
            ></ion-input>
          </ion-item>
        </ion-list>

        <ion-button
          class="rod-btn-primary"
          type="submit"
          expand="block"
          [disabled]="form.invalid || guardando()"
        >
          Guardar y empezar
          <ion-icon slot="end" name="checkmark-circle-outline" aria-hidden="true"></ion-icon>
        </ion-button>
      </form>
    </ion-content>
  `,
  styles: [
    `
      .moto-form {
        max-width: 560px;
        padding-bottom: 40px;
      }
      .intro {
        margin-bottom: 20px;
      }
      .intro-icon {
        width: 64px;
        height: 64px;
        margin-bottom: 14px;
        border-radius: 18px;
        display: grid;
        place-items: center;
        background: var(--rod-accent-soft);
        color: var(--ion-color-primary);
        font-size: 36px;
      }
      .intro h1 {
        margin: 0 0 6px;
        font-family: var(--rod-font-heading);
        font-size: 22px;
        font-weight: 700;
        color: var(--rod-text-heading);
      }
      .intro p {
        margin: 0;
        font-size: 13px;
        line-height: 1.5;
        color: var(--rod-text-secondary);
      }
      .campos {
        background: transparent;
        padding: 0;
      }
      .runt {
        margin-bottom: 16px;
      }
      .runt h2 {
        font-family: var(--rod-font-heading);
        font-size: 17px;
        font-weight: 600;
        margin: 0 0 4px;
        color: var(--rod-text-heading);
      }
      .runt .ayuda {
        font-size: 13px;
        color: var(--rod-text-secondary);
        margin: 0 0 8px;
      }
      .runt .campos ion-item {
        --padding-start: 0;
      }
      .resultado {
        margin-top: 12px;
        font-size: 14px;
      }
      .resultado p {
        margin: 4px 0;
      }
      .resultado .alerta {
        color: var(--ion-color-warning-shade);
      }
      .resultado ion-checkbox {
        margin-top: 8px;
      }
      ion-button {
        margin-top: 20px;
      }
    `,
  ],
})
export class MotoFormPage {
  private readonly fb = inject(FormBuilder);
  private readonly motosService = inject(MotosService);
  private readonly runtService = inject(RuntService);
  private readonly supabase = inject(SupabaseService);
  private readonly notify = inject(NotificationService);
  private readonly router = inject(Router);

  readonly guardando = signal(false);
  readonly consultando = signal(false);
  readonly runt = signal<RuntResumen | null>(null);
  readonly guardarDocumentos = signal(true);

  readonly tiposDoc: { valor: TipoDocumentoRunt; etiqueta: string }[] = [
    { valor: 'CC', etiqueta: 'Cedula de ciudadania' },
    { valor: 'CE', etiqueta: 'Cedula de extranjeria' },
    { valor: 'TI', etiqueta: 'Tarjeta de identidad' },
    { valor: 'PA', etiqueta: 'Pasaporte' },
    { valor: 'PPT', etiqueta: 'Permiso por proteccion temporal' },
    { valor: 'NIT', etiqueta: 'NIT' },
    { valor: 'CD', etiqueta: 'Carne diplomatico' },
    { valor: 'RC', etiqueta: 'Registro civil' },
  ];

  readonly form = this.fb.nonNullable.group({
    marca: ['', [Validators.required]],
    modelo: ['', [Validators.required]],
    placa: ['', [Validators.required]],
    cilindrada: [null as number | null],
    odometroInicial: [0, [Validators.min(0)]],
  });

  /** Datos solo para la consulta: el documento no se guarda en la base. */
  readonly runtForm = this.fb.nonNullable.group({
    docType: ['CC' as TipoDocumentoRunt],
    docNumber: [''],
  });

  puedeConsultar(): boolean {
    const placa = this.form.controls.placa.value.replace(/[\s-]/g, '');
    const doc = this.runtForm.controls.docNumber.value.replace(/[\s.]/g, '');
    return placa.length >= 5 && doc.length >= 3;
  }

  async consultarRunt(): Promise<void> {
    const placa = this.form.controls.placa.value;
    const { docType, docNumber } = this.runtForm.getRawValue();

    this.consultando.set(true);
    try {
      const r = await this.runtService.consultar(placa, docType, docNumber);
      this.runt.set(r);

      // Solo se sobreescriben los campos que el RUNT trae con valor.
      const { marca, linea, modelo, cilindraje } = r.vehiculo;
      this.form.patchValue({
        placa: r.placa,
        ...(marca ? { marca: titulo(marca) } : {}),
        ...(linea ? { modelo: [linea, modelo].filter(Boolean).join(' ') } : {}),
        ...(cilindraje ? { cilindrada: cilindraje } : {}),
      });

      if (r.vehiculo.clase && r.vehiculo.clase !== 'MOTOCICLETA') {
        await this.notify.info(`Ojo: el RUNT registra este vehiculo como ${r.vehiculo.clase}.`);
      } else {
        await this.notify.success(
          r.fuente === 'mock' ? 'Datos de prueba cargados (modo mock).' : 'Datos cargados desde el RUNT.',
        );
      }
    } catch (error) {
      this.runt.set(null);
      await this.notify.error(
        error instanceof RuntError ? error.message : 'No se pudo consultar el RUNT.',
      );
      console.error('[MotoFormPage] consultarRunt', error);
    } finally {
      this.consultando.set(false);
    }
  }

  async guardar(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      await this.notify.error('Completa los campos obligatorios.');
      return;
    }

    const { marca, modelo, placa, cilindrada, odometroInicial } = this.form.getRawValue();
    this.guardando.set(true);
    try {
      const moto = await this.motosService.crear({
        marca: marca.trim(),
        modelo: modelo.trim(),
        placa: placa.trim().toUpperCase(),
        cilindrada: cilindrada ?? null,
        odometro_inicial: odometroInicial ?? 0,
      });

      const docsGuardados = await this.guardarDocumentosRunt(moto.id, placa);
      await this.notify.success(
        docsGuardados ? 'Moto registrada con su SOAT y RTM.' : 'Moto registrada.',
      );
      await this.router.navigateByUrl('/app/garaje');
    } catch (error) {
      if ((error as { code?: string })?.code === '23505') {
        await this.notify.error('Ya existe una moto registrada con esa placa.');
      } else {
        await this.notify.error('No se pudo registrar la moto. Intenta de nuevo.');
      }
      console.error('[MotoFormPage] guardar', error);
    } finally {
      this.guardando.set(false);
    }
  }

  /**
   * Inserta el SOAT y la RTM que trajo el RUNT. Si fallan, la moto ya quedo
   * creada: se avisa pero no se trata como error de registro.
   */
  private async guardarDocumentosRunt(motoId: string | undefined, placa: string): Promise<boolean> {
    const r = this.runt();
    const mismaPlaca = r?.placa === placa.trim().toUpperCase().replace(/[\s-]/g, '');
    if (!motoId || !r || !mismaPlaca || !this.guardarDocumentos() || (!r.soat && !r.rtm)) {
      return false;
    }

    try {
      if (r.soat?.numeroPoliza && r.soat.fechaInicio && r.soat.fechaVencimiento) {
        const { error } = await this.supabase.registrarSoat({
          moto_id: motoId,
          numero_poliza: r.soat.numeroPoliza,
          aseguradora: r.soat.aseguradora,
          fecha_inicio: r.soat.fechaInicio,
          fecha_vencimiento: r.soat.fechaVencimiento,
        });
        if (error) throw error;
      }
      if (r.rtm?.numeroCertificado && r.rtm.fechaExpedicion && r.rtm.fechaVencimiento) {
        const { error } = await this.supabase.registrarRtm({
          moto_id: motoId,
          numero_certificado: r.rtm.numeroCertificado,
          nombre_cda: r.rtm.cda,
          fecha_expedicion: r.rtm.fechaExpedicion,
          fecha_vencimiento: r.rtm.fechaVencimiento,
        });
        if (error) throw error;
      }
      return true;
    } catch (error) {
      console.error('[MotoFormPage] guardarDocumentosRunt', error);
      await this.notify.info('La moto quedo registrada, pero no se pudieron guardar SOAT/RTM.');
      return false;
    }
  }
}

/** "YAMAHA" -> "Yamaha" (el RUNT devuelve todo en mayusculas). */
function titulo(s: string): string {
  return s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}
