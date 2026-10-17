import {
  createElement,
  isValidElement,
  useLayoutEffect,
  useRef,
  type ReactElement,
  type RefObject,
} from "react";
import { FlatList, View } from "react-native";
import DraggableFlatList, {
  ScaleDecorator,
  NestableDraggableFlatList,
  NestableScrollContainer,
  type DraggableFlatListProps,
} from "react-native-draggable-flatlist";

export interface ListSection<Item> {
  key: string;
  title: string;
  data: Item[];
}

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
> & {
  reordering: boolean;
  sections?: ListSection<Item>[];
  renderSectionHeader?: (section: ListSection<Item>) => ReactElement;
};

type ScrollHandle = {
  scrollToOffset: (options: { offset: number; animated: boolean }) => void;
};

export function ReorderableList<Item>({
  sections,
  renderSectionHeader,
  ...props
}: ListProps<Item>) {
  const offsetRef = useRef(0);
  if (sections)
    return (
      <SectionedListSurface
        {...props}
        sections={sections}
        renderSectionHeader={renderSectionHeader}
      />
    );
  return (
    <ListSurface
      key={props.reordering ? "reorder" : "browse"}
      {...props}
      offsetRef={offsetRef}
    />
  );
}

function listComponent(component: ListProps<unknown>["ListHeaderComponent"]) {
  if (!component) return null;
  return isValidElement(component) ? component : createElement(component);
}

function SectionedListSurface<Item>({
  sections,
  reordering,
  renderSectionHeader,
  renderItem,
  containerStyle,
  contentContainerStyle,
  ListHeaderComponent,
  ListFooterComponent,
  ListEmptyComponent,
  ...props
}: ListProps<Item> & { sections: ListSection<Item>[] }) {
  // Keep the outer scroll container mounted when entering or leaving reorder mode.
  return (
    <NestableScrollContainer
      style={containerStyle}
      contentContainerStyle={contentContainerStyle}
      showsVerticalScrollIndicator={props.showsVerticalScrollIndicator}
      keyboardShouldPersistTaps={props.keyboardShouldPersistTaps}
    >
      {listComponent(ListHeaderComponent)}
      {sections.length === 0 && listComponent(ListEmptyComponent)}
      {sections.map((section, sectionIndex) => {
        const offset = sections
          .slice(0, sectionIndex)
          .reduce((sum, item) => sum + item.data.length, 0);
        return (
          <View
            key={section.key}
            style={{ gap: 12, paddingTop: sectionIndex > 0 ? 32 : 0 }}
          >
            {renderSectionHeader?.(section)}
            {reordering ? (
              <NestableDraggableFlatList
                data={section.data}
                extraData={props.extraData}
                keyExtractor={props.keyExtractor}
                ItemSeparatorComponent={props.ItemSeparatorComponent}
                keyboardShouldPersistTaps={props.keyboardShouldPersistTaps}
                activationDistance={props.activationDistance}
                autoscrollThreshold={props.autoscrollThreshold}
                autoscrollSpeed={props.autoscrollSpeed}
                dragItemOverflow={false}
                onDragBegin={(index) => props.onDragBegin?.(offset + index)}
                onDragEnd={({ data, from, to }) =>
                  props.onDragEnd?.({
                    data: sections.flatMap((item) =>
                      item.key === section.key ? data : item.data,
                    ),
                    from: offset + from,
                    to: offset + to,
                  })
                }
                renderItem={(params) => {
                  const item = renderItem({
                    ...params,
                    getIndex: () => {
                      const index = params.getIndex();
                      return index === undefined ? undefined : offset + index;
                    },
                  });
                  return (
                    <ScaleDecorator activeScale={1.02}>{item}</ScaleDecorator>
                  );
                }}
              />
            ) : (
              // A nested draggable list installs a pan recognizer even before drag()
              // is called. Plain rows let the outer container own browsing swipes.
              <View>
                {section.data.map((item, index) => (
                  <View key={props.keyExtractor(item, offset + index)}>
                    {index > 0 && listComponent(props.ItemSeparatorComponent)}
                    {renderItem({
                      item,
                      getIndex: () => offset + index,
                      isActive: false,
                      drag: () => {},
                    })}
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
      {listComponent(ListFooterComponent)}
    </NestableScrollContainer>
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
}: Omit<ListProps<Item>, "sections" | "renderSectionHeader"> & {
  offsetRef: RefObject<number>;
}) {
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
