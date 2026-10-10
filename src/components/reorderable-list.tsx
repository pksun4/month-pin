import { useLayoutEffect, useRef, type RefObject } from "react";
import { FlatList, View } from "react-native";
import DraggableFlatList, {
  ScaleDecorator,
  type DraggableFlatListProps,
} from "react-native-draggable-flatlist";

type ListProps<Item> = Pick<
  DraggableFlatListProps<Item>,
  | "data"
  | "keyExtractor"
  | "renderItem"
  | "extraData"
  | "containerStyle"
  | "contentContainerStyle"
  | "showsVerticalScrollIndicator"
  | "keyboardShouldPersistTaps"
  | "activationDistance"
  | "autoscrollThreshold"
  | "autoscrollSpeed"
  | "onDragBegin"
  | "onDragEnd"
  | "ListHeaderComponent"
  | "ListFooterComponent"
  | "ListEmptyComponent"
  | "ItemSeparatorComponent"
> & { reordering: boolean };

type ScrollHandle = {
  scrollToOffset: (options: { offset: number; animated: boolean }) => void;
};

export function ReorderableList<Item>(props: ListProps<Item>) {
  const offsetRef = useRef(0);
  return (
    <ListSurface
      key={props.reordering ? "reorder" : "browse"}
      {...props}
      offsetRef={offsetRef}
    />
  );
}

function ListSurface<Item>({
  reordering,
  offsetRef,
  containerStyle,
  renderItem,
  activationDistance,
  autoscrollThreshold,
  autoscrollSpeed,
  onDragBegin,
  onDragEnd,
  ...listProps
}: ListProps<Item> & { offsetRef: RefObject<number> }) {
  const listRef = useRef<ScrollHandle | null>(null);
  const initialOffsetRef = useRef(0);
  const restoringRef = useRef(true);

  useLayoutEffect(() => {
    initialOffsetRef.current = offsetRef.current;
    restoringRef.current = initialOffsetRef.current > 0;
  }, [offsetRef]);

  function rememberOffset(next: number) {
    // A newly mounted list can report zero before its old position is restored.
    if (!restoringRef.current) offsetRef.current = Math.max(0, next);
  }

  function restoreOffset() {
    if (!restoringRef.current || !listRef.current) return;
    restoringRef.current = false;
    listRef.current.scrollToOffset({
      offset: initialOffsetRef.current,
      animated: false,
    });
  }

  const setRef = (list: ScrollHandle | null) => {
    listRef.current = list;
  };

  if (reordering)
    return (
      <DraggableFlatList
        {...listProps}
        ref={setRef}
        containerStyle={containerStyle}
        activationDistance={activationDistance}
        autoscrollThreshold={autoscrollThreshold}
        autoscrollSpeed={autoscrollSpeed}
        onDragBegin={onDragBegin}
        onDragEnd={onDragEnd}
        onScrollOffsetChange={rememberOffset}
        onContentSizeChange={restoreOffset}
        renderItem={(params) => (
          <ScaleDecorator activeScale={1.02}>
            {renderItem(params)}
          </ScaleDecorator>
        )}
      />
    );

  return (
    <View style={containerStyle}>
      <FlatList
        {...listProps}
        ref={setRef}
        onScroll={({ nativeEvent }) =>
          rememberOffset(nativeEvent.contentOffset.y)
        }
        scrollEventThrottle={16}
        onContentSizeChange={restoreOffset}
        renderItem={({ item, index }) => (
          <>
            {renderItem({
              item,
              getIndex: () => index,
              isActive: false,
              drag: () => {},
            })}
          </>
        )}
      />
    </View>
  );
}
