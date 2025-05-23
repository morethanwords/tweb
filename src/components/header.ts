/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import themeController from '../helpers/themeController';
import {attachClickEvent} from '../helpers/dom/clickEvent';
import cancelEvent from '../helpers/dom/cancelEvent';
import rootScope from '../lib/rootScope';

export default class Header {
  private container: HTMLElement;
  private themeButton: HTMLElement;
  private isDark: boolean;

  constructor() {
    this.container = document.createElement('header');
    this.container.classList.add('header');

    this.isDark = document.documentElement.classList.contains('night');

    this.createHeader();
    this.attachEventListeners();
  }

  private createHeader() {
    // Логотип с неофициальной версией поверх текста
    const logoContainer = document.createElement('div');
    logoContainer.classList.add('header-logo');

    const logoIcon = document.createElement('div');
    logoIcon.classList.add('header-logo-icon');
    logoIcon.innerHTML = `
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14.6667 1.83333H7.33333C3.66667 1.83333 1.83333 3.66667 1.83333 7.33333V19.25C1.83333 19.7542 2.24583 20.1667 2.75 20.1667H14.6667C18.3333 20.1667 20.1667 18.3333 20.1667 14.6667V7.33333C20.1667 3.66667 18.3333 1.83333 14.6667 1.83333ZM12.8333 13.9792H6.41667C6.04083 13.9792 5.72917 13.6675 5.72917 13.2917C5.72917 12.9158 6.04083 12.6042 6.41667 12.6042H12.8333C13.2092 12.6042 13.5208 12.9158 13.5208 13.2917C13.5208 13.6675 13.2092 13.9792 12.8333 13.9792ZM15.5833 9.39583H6.41667C6.04083 9.39583 5.72917 9.08417 5.72917 8.70833C5.72917 8.3325 6.04083 8.02083 6.41667 8.02083H15.5833C15.9592 8.02083 16.2708 8.3325 16.2708 8.70833C16.2708 9.08417 15.9592 9.39583 15.5833 9.39583Z" fill="white"/>
      </svg>
    `;

    const logoTextContainer = document.createElement('div');
    logoTextContainer.classList.add('header-logo-text-container');

    const unofficialText = document.createElement('span');
    unofficialText.classList.add('header-unofficial-text');
    unofficialText.textContent = '*неофициальная версия';

    const logoText = document.createElement('span');
    logoText.classList.add('header-logo-text');
    logoText.textContent = 'Telegram';

    logoTextContainer.append(unofficialText, logoText);
    logoContainer.append(logoIcon, logoTextContainer);

    // Кнопка покупки звезд (по центру)
    const botButton = document.createElement('button');
    botButton.classList.add('header-bot-button');

    const starIcon = document.createElement('span');
    starIcon.classList.add('header-bot-button-icon');
    starIcon.innerHTML = `
      <svg width="21" height="20" viewBox="0 0 21 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8.48345 6.58093C9.38066 4.97142 9.82927 4.16667 10.5 4.16667C11.1707 4.16667 11.6193 4.97142 12.5165 6.58093L12.7486 6.99733C13.0035 7.4547 13.131 7.68339 13.3298 7.83428C13.5286 7.98517 13.7761 8.04118 14.2712 8.1532L14.722 8.25519C16.4642 8.64939 17.3354 8.8465 17.5426 9.51298C17.7499 10.1795 17.156 10.8739 15.9682 12.2629L15.6609 12.6222C15.3234 13.0169 15.1546 13.2142 15.0787 13.4584C15.0028 13.7025 15.0283 13.9658 15.0793 14.4924L15.1258 14.9719C15.3054 16.825 15.3952 17.7516 14.8526 18.1635C14.31 18.5754 13.4943 18.1998 11.863 17.4487L11.441 17.2544C10.9774 17.041 10.7456 16.9343 10.5 16.9343C10.2543 16.9343 10.0225 17.041 9.55893 17.2544L9.13689 17.4487C7.5056 18.1998 6.68996 18.5754 6.14736 18.1635C5.60475 17.7516 5.69454 16.825 5.87411 14.9719L5.92057 14.4924C5.9716 13.9658 5.99712 13.7025 5.9212 13.4584C5.84527 13.2142 5.67651 13.0169 5.33898 12.6222L5.03169 12.2629C3.84393 10.8739 3.25004 10.1795 3.4573 9.51298C3.66455 8.8465 4.53569 8.64939 6.27796 8.25519L6.72871 8.1532C7.22381 8.04118 7.47136 7.98517 7.67013 7.83428C7.86889 7.68339 7.99637 7.4547 8.25133 6.99733L8.48345 6.58093Z" fill="#FFCC00"/>
        <path d="M4.13944 2.08365C4.16443 1.9955 4.3209 1.99497 4.34649 2.08295C4.46332 2.48471 4.67997 3.07856 5.00757 3.40396C5.33518 3.72936 5.93047 3.94198 6.33301 4.0561C6.42117 4.0811 6.42169 4.23757 6.33371 4.26315C5.93195 4.37999 5.33811 4.59663 5.01271 4.92424C4.68731 5.25184 4.47468 5.84714 4.36056 6.24968C4.33557 6.33783 4.1791 6.33836 4.15351 6.25038C4.03668 5.84862 3.82003 5.25477 3.49243 4.92937C3.16482 4.60398 2.56953 4.39135 2.16699 4.27723C2.07883 4.25224 2.07831 4.09577 2.16629 4.07018C2.56805 3.95334 3.16189 3.7367 3.48729 3.40909C3.81269 3.08149 4.02532 2.48619 4.13944 2.08365Z" fill="#FFCC00"/>
        <path fill-rule="evenodd" clip-rule="evenodd" d="M15.9166 2.70833C16.2618 2.70833 16.5416 2.98816 16.5416 3.33333V3.54167H16.75C17.0952 3.54167 17.375 3.82149 17.375 4.16667C17.375 4.51184 17.0952 4.79167 16.75 4.79167H16.5416V5C16.5416 5.34518 16.2618 5.625 15.9166 5.625C15.5715 5.625 15.2916 5.34518 15.2916 5V4.79167H15.0833C14.7381 4.79167 14.4583 4.51184 14.4583 4.16667C14.4583 3.82149 14.7381 3.54167 15.0833 3.54167H15.2916V3.33333C15.2916 2.98816 15.5715 2.70833 15.9166 2.70833Z" fill="#FFCC00"/>
      </svg>
    `;

    const buttonText = document.createElement('span');
    buttonText.textContent = 'Купить 50 звёзд за 79 руб.';

    botButton.append(starIcon, buttonText);
    botButton.addEventListener('click', () => {
      window.open('https://t.me/StarsotekaRobot', '_blank');
    });

    // Правая часть: поиск + переключатель темы
    const rightSection = document.createElement('div');
    rightSection.classList.add('header-right-section');

    // Поле поиска
    const searchContainer = document.createElement('div');
    searchContainer.classList.add('header-search-container');

    const searchInput = document.createElement('input');
    searchInput.classList.add('header-search-input');
    searchInput.type = 'text';
    searchInput.placeholder = 'База знаний...';

    const searchIcon = document.createElement('div');
    searchIcon.classList.add('header-search-icon');
    searchIcon.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/>
        <path d="m21 21-4.35-4.35" stroke="currentColor" stroke-width="2"/>
      </svg>
    `;

    const slashHint = document.createElement('div');
    slashHint.classList.add('header-search-slash');
    slashHint.textContent = '/';

    searchContainer.append(searchIcon, searchInput, slashHint);

    // Разделительная линия
    const divider = document.createElement('div');
    divider.classList.add('header-divider');

    // Кнопка переключения темы
    this.themeButton = document.createElement('button');
    this.themeButton.classList.add('header-theme-button');
    this.updateThemeButton();

    rightSection.append(searchContainer, divider, this.themeButton);

    this.container.append(logoContainer, botButton, rightSection);
  }

  private updateThemeButton() {
    const lightIcon = `
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M9 14.875C11.6924 14.875 13.875 12.6924 13.875 10C13.875 7.30761 11.6924 5.125 9 5.125C6.30761 5.125 4.125 7.30761 4.125 10C4.125 12.6924 6.30761 14.875 9 14.875Z" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M14.355 15.355L14.2575 15.2575M14.2575 4.7425L14.355 4.645L14.2575 4.7425ZM3.645 15.355L3.7425 15.2575L3.645 15.355ZM9 2.56V2.5V2.56ZM9 17.5V17.44V17.5ZM1.56 10H1.5H1.56ZM16.5 10H16.44H16.5ZM3.7425 4.7425L3.645 4.645L3.7425 4.7425Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;

    const darkIcon = `
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M1.52257 10.315C1.79257 14.1775 5.07007 17.32 8.99257 17.4925C11.7601 17.6125 14.2351 16.3225 15.7201 14.29C16.3351 13.4575 16.0051 12.9025 14.9776 13.09C14.4751 13.18 13.9576 13.2175 13.4176 13.195C9.75007 13.045 6.75007 9.9775 6.73507 6.355C6.72757 5.38 6.93007 4.4575 7.29757 3.6175C7.70257 2.6875 7.21507 2.245 6.27757 2.6425C3.30757 3.895 1.27507 6.8875 1.52257 10.315Z" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;

    this.themeButton.innerHTML = this.isDark ? lightIcon : darkIcon;
    this.themeButton.title = this.isDark ? 'Switch to light theme' : 'Switch to dark theme';
  }

  private attachEventListeners() {
    attachClickEvent(this.themeButton, (e) => {
      cancelEvent(e);
      this.toggleTheme();
    });

    // Слушаем изменения темы извне
    rootScope.addEventListener('theme_changed', () => {
      this.isDark = document.documentElement.classList.contains('night');
      this.updateThemeButton();
    });
  }

  private toggleTheme() {
    this.isDark = !this.isDark;
    themeController.switchTheme(this.isDark ? 'night' : 'day');
    this.updateThemeButton();
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public destroy() {
    this.container.remove();
  }
}