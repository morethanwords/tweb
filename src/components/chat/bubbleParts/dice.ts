import type {BubbleContext} from '@components/chat/bubbles';
import type {MessageMedia, Document} from '@layer';
import type {MyDocument} from '@lib/appManagers/appDocsManager';
import type ChatBubbles from '@components/chat/bubbles';
import {makeMediaSize} from '@helpers/mediaSize';
import RLottiePlayer from '@lib/rlottie/rlottiePlayer';
import wrapSticker from '@components/wrappers/sticker';
import lottieLoader from '@lib/rlottie/lottieLoader';

export default function wrapDice(context: BubbleContext) {
  const {emoticon, value} = context.messageMedia as MessageMedia.messageMediaDice;
  context.bubble.dataset.dice = emoticon;

  const isSlot = emoticon === '🎰';
  const stickerSet = context.bubbles.managers.appStickersManager.getStickerSetByDice(emoticon);
  const getDocument = (index: number) => stickerSet.then(({documents}) => documents[index] as MyDocument);

  const size = makeMediaSize(512, 512);
  const boxSize = makeMediaSize(180, 180);
  const unknown = !value;
  const play = unknown || context.isInUnread;
  const commonOptions: Omit<Parameters<ChatBubbles['wrapSticker']>[1], 'doc' | 'container'> = {
    size,
    boxSize,
    initFrame: play ? undefined : Infinity,
    ...(isSlot ? {
      loop: false,
      play: false,
      manual: play
    } : {
      loop: unknown,
      play: play,
      manual: unknown
    }),
    width: boxSize.width,
    height: boxSize.height
  };

  if(isSlot) {
    const winValue = 64;
    const backgroundIndex = 0;
    const backgroundWinIndex = 1;
    const handleIndex = 2;
    const spinningIndexes = [8, 14, 20];
    const playFirstIndexes = [handleIndex, ...spinningIndexes];
    const getSlots = (value: number): [number, number, number] => {
      if(value === winValue) {
        return [3, 9, 15];
      }

      const map = [1, 2, 3, 0];
      return [
        4 + map[(value - 1) & 3],
        10 + map[((value - 1) >> 2) & 3],
        16 + map[((value - 1) >> 4) & 3]
      ];
    };
    const isSlotOption = (value: number) => value > 2 && !playFirstIndexes.includes(value);

    const promises = [
      value === winValue && !play ? backgroundWinIndex : backgroundIndex,
      handleIndex,
      ...(play ? spinningIndexes : []),
      ...(play ? [] : getSlots(value))
    ].map((index) => ({
      index,
      promise: getDocument(index)
    }));

    const wrapPart = (index: number, promise: Promise<Document>) => {
      const div = document.createElement('div');
      div.classList.add('bubble-slot-part');
      // div.dataset.slotIndex = index + '';

      const shouldHide = (isSlotOption(index) || index === backgroundWinIndex) && play;

      const playerPromise = context.bubbles.wrapSticker(context, {
        ...commonOptions,
        doc: promise as Promise<MyDocument>,
        container: div,
        noFadeIn: shouldHide
      }).then(({render}) => render as Promise<RLottiePlayer>);

      // * keep frame the last child
      if(isSlotOption(index) || spinningIndexes.includes(index)) {
        context.attachmentDiv.insertBefore(div, context.attachmentDiv.lastElementChild);
      } else {
        context.attachmentDiv.append(div);
      }

      if(shouldHide) {
        div.classList.add('hide');
      }

      return {index, div, playerPromise};
    };

    const parts = promises.map(({index, promise}) => {
      return wrapPart(index, promise);
    });

    context.attachmentDiv.style.width = context.bubbleContainer.style.minWidth;
    context.attachmentDiv.style.height = context.bubbleContainer.style.minHeight;

    if(!play) {
      return;
    }

    const getPartReady = async(part: typeof parts[number]) => {
      const player = await part.playerPromise;
      await lottieLoader.waitForFirstFrame(player);
      return {...part, player};
    };

    const partsReadyPromises = parts.map(getPartReady);
    const readyPromise = Promise.all(partsReadyPromises);
    readyPromise.then((parts) => {
      parts
      .filter(({index}) => playFirstIndexes.includes(index))
      .forEach(({index, div, player}) => {
        if(spinningIndexes.includes(index)) {
          player.loop = true; // * wait until all spinning parts are ready
        }

        player.play();
      });
    });

    context.releaseDice = (value) => {
      // value = winValue;
      context.releaseDice = undefined;

      const newPartsReadyPromises = [...getSlots(value), backgroundWinIndex]
      .map((index) => getPartReady(wrapPart(index, getDocument(index))));
      const readyPromise = Promise.all([...partsReadyPromises, ...newPartsReadyPromises]);
      readyPromise.then((parts) => {
        // console.log('parts', parts);
        const slotsParts = parts.filter(({index}) => isSlotOption(index));
        const spinningParts = parts.filter(({index}) => spinningIndexes.includes(index));
        const replaceBackground = () => {
          const backgroundPart = parts.find(({index}) => index === backgroundIndex);
          const backgroundWinPart = parts.find(({index}) => index === backgroundWinIndex);
          backgroundPart.div.replaceWith(backgroundWinPart.div);
          backgroundWinPart.div.classList.remove('hide');
          backgroundWinPart.player.play();
        };
        let left = 3;
        spinningParts.forEach(({player, div}, lookForIndex) => {
          player.playToFrame({
            frame: player.maxFrame,
            callback: () => {
              div.classList.add('hide');
              const slotPart = slotsParts[lookForIndex];
              if(value === winValue) {
                const onFrame = (frameNo: number) => {
                  if(frameNo >= 90 && !--left) {
                    replaceBackground();
                    slotPart.player.removeEventListener('enterFrame', onFrame);
                  }
                };
                slotPart.player.addEventListener('enterFrame', onFrame);
              }
              slotPart.div.classList.remove('hide');
              slotPart.player.play();
            }
          });
        });
      });
    };

    if(!unknown) {
      context.releaseDice(value);
    }

    return;
  }

  const result = context.bubbles.wrapSticker(context, {
    ...commonOptions,
    doc: getDocument(value),
    container: context.attachmentDiv
  });

  if(unknown) {
    const loopedPlayerPromise = result.then(({render}) => {
      return render as Promise<RLottiePlayer>;
    });

    context.releaseDice = async(value) => {
      context.releaseDice = undefined;

      const doc = await getDocument(value);
      context.attachmentDiv.dataset.docId = doc.id + '';
      const player = await wrapSticker({
        doc,
        div: document.createElement('div'),
        middleware: context.middleware,
        play: false,
        loop: false,
        withThumb: false,
        needFadeIn: false
      }).then(({render}) => render as Promise<RLottiePlayer>);
      await lottieLoader.waitForFirstFrame(player);
      if(!context.middleware()) return;

      const loopedPlayer = await loopedPlayerPromise;
      if(!context.middleware()) return;
      loopedPlayer.playToFrame({
        frame: loopedPlayer.maxFrame,
        callback: () => {
          loopedPlayer.canvas[0].replaceWith(player.canvas[0]);
          player.play();
        }
      });
    };
  }
}
