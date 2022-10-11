import { AfterViewChecked, ChangeDetectionStrategy, ChangeDetectorRef, OnInit } from '@angular/core';
import { Component } from '@angular/core';
import { environment } from 'src/environments/environment';
import { CoreComponent } from './core/core.component';
import { KontentService } from './services/kontent.service';
import { catchError, map, of } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { saveAs } from 'file-saver';

export interface IBuildResponse {
    executionTime: string;
    gitHubResult: string;
    isDebug: boolean;
    isPreview: boolean;
    storeOnGithub: boolean;
    root: string;
    filename: string;
    warnings: string[];
    openApiJson: any;
}

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent extends CoreComponent implements OnInit, AfterViewChecked {
    private readonly functionApiReferenceCodenameMacro: string = '{{apiReferenceCodename}}';

    // base
    public loading: boolean = false;
    public errorMessage?: string;
    public infoMessage?: string;

    //  course
    public courseCodename?: string;

    // response
    public buildResponse?: IBuildResponse;

    // publish
    public publishToGitHub: boolean = true;

    // azure function url
    public azureFunctionUrl?: string;

    constructor(private kontentService: KontentService, private httpClient: HttpClient, cdr: ChangeDetectorRef) {
        super(cdr);
    }

    ngOnInit(): void {
        if (this.isKontentContext()) {
            this.kontentService.initCustomElement(
                (data) => {
                    // get codename of current course content item
                    this.courseCodename = data.context.item.codename;
                    this.azureFunctionUrl = data.azureFunctionUrl;
                },
                (error) => {
                    console.error(error);
                    this.errorMessage = `Could not initialize custom element. Custom elements can only be embedded in an iframe`;
                    super.detectChanges();
                }
            );
        } else {
            this.courseCodename = environment.kontent.defaultCourseCodename;
            this.azureFunctionUrl = environment.kontent.azureFunctionUrl;
        }
    }

    ngAfterViewChecked(): void {
        // update size of Kontent UI
        if (this.isKontentContext()) {
            // this is required because otherwise the offsetHeight can return 0 in some circumstances
            // https://stackoverflow.com/questions/294250/how-do-i-retrieve-an-html-elements-actual-width-and-height
            setTimeout(() => {
                const htmlElement = document.getElementById('htmlElem');
                if (htmlElement) {
                    const height = htmlElement.offsetHeight;
                    this.kontentService.updateSizeToMatchHtml(height);
                }
            }, 50);
        }
    }

    handleDownloadOpenApi(): void {
        if (!this.buildResponse) {
            return;
        }

        const file = new Blob([JSON.stringify(this.buildResponse.openApiJson)], { type: 'application/json' });

        saveAs(file, `${this.buildResponse.filename}`);
    }

    buildCourse(isPreview: boolean): void {
        this.clearStatus();

        if (this.loading) {
            return;
        }

        this.loading = true;

        super.subscribeToObservable(
            this.httpClient.get<IBuildResponse>(this.getBuildCourseUrl(isPreview)).pipe(
                map((response) => {
                    this.buildResponse = response;
                    this.loading = false;

                    super.markForCheck();
                }),
                catchError((error) => {
                    this.loading = false;
                    this.errorMessage =
                        'There was an error building course. Please see browser console for more details';
                    super.markForCheck();

                    return of(false);
                })
            )
        );
    }

    private clearStatus(): void {
        this.errorMessage = undefined;
        this.infoMessage = undefined;
        this.buildResponse = undefined;
    }

    private getBuildCourseUrl(isPreview: boolean): string {
        if (!this.courseCodename) {
            throw Error(`Invalid course codename`);
        }

        if (!this.azureFunctionUrl) {
            throw Error(`Invalid custom element configuration. Missing 'azureFunctionUrl' configuration option`);
        }

        const url = `${this.azureFunctionUrl.replace(this.functionApiReferenceCodenameMacro, this.courseCodename)}${
            this.azureFunctionUrl.includes('?') ? '&' : '?'
        }isPreview=${isPreview ? 'true' : 'false'}&storeOnGithub=${this.publishToGitHub ? 'true' : 'false'}`;

        return url;
    }

    private isKontentContext(): boolean {
        return environment.production;
    }
}
